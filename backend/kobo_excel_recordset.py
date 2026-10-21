"""Load prepared rows through ADO without evaluating Power Query during export."""
from datetime import datetime
from xml.etree import ElementTree as ET
from xml.sax.saxutils import quoteattr

SCHEMA = 'uuid:BDC6E3F0-6DA3-11d1-A2A3-00AA00C14882'
ROWSET = 'urn:schemas-microsoft-com:rowset'


def recordset_schema(headers, kinds):
    import win32com.client
    recordset = win32com.client.Dispatch('ADODB.Recordset')
    recordset.CursorLocation = 3
    for header, kind in zip(headers, kinds):
        if kind == 202: recordset.Fields.Append(header, kind, 32767, 32)
        else: recordset.Fields.Append(header, kind, 0, 32)
    recordset.Open()
    document = win32com.client.Dispatch('MSXML2.DOMDocument.6.0')
    try:
        recordset.Save(document, 1)
        xml = document.xml
    finally:
        recordset.Close()
    root = ET.fromstring(xml)
    attributes = root.findall(f'.//{{{SCHEMA}}}AttributeType')
    attributes.sort(key=lambda item: int(item.get(f'{{{ROWSET}}}number')))
    return xml, [item.get('name') for item in attributes]


def prepared_recordset(config, rows, cache):
    import win32com.client
    headers = config['headers']; kinds = [202]*len(headers)
    kinds[headers.index('Selected')] = kinds[headers.index('Answered')] = 3
    kinds[headers.index('Source row')] = 5
    first_detail = len(headers)-len(config['details'])
    for index, detail in enumerate(config['details'], first_detail):
        kind = config['fields'][detail['id']]['kind']
        if kind == 'number': kinds[index] = 5
        elif kind == 'date': kinds[index] = 135
    key = (tuple(headers), tuple(kinds))
    if key not in cache: cache[key] = recordset_schema(headers, kinds)
    xml, attributes = cache[key]
    values = []
    for row in rows:
        parts = []
        for name, value in zip(attributes, row):
            if value is None: continue
            if isinstance(value, datetime): text = value.isoformat(timespec='milliseconds')
            else: text = str(value)
            parts.append(name+'='+quoteattr(text))
        values.append('<z:row '+' '.join(parts)+'/>')
    import re
    xml = re.sub(r'<rs:data\s*/>|<rs:data>.*?</rs:data>', lambda _: '<rs:data>'+''.join(values)+'</rs:data>', xml, flags=re.S)
    document = win32com.client.Dispatch('MSXML2.DOMDocument.6.0')
    if not document.loadXML(xml): raise ValueError('Could not prepare the native query recordset.')
    recordset = win32com.client.Dispatch('ADODB.Recordset'); recordset.CursorLocation = 3
    recordset.Open(document)
    return recordset
