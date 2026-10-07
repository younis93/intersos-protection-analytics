"""Resolve only affected source fields for finding messages."""
from collections import defaultdict

from .hotline_review import FIELDS as HOTLINE_FIELDS
from .legal_platform import _find, clean_id, display_value

ALIASES = {
    'Date of Birth': ('Date of Birth', 'DoB'),
    'Marital Status': ('Marital Status', 'Marital Statues'),
    'Participant Name': ('Participant Name', 'Name / الأسم'),
    'Session Topic': ('Session Topic', 'Topic'),
    'Project': ('Projects -', 'Project'),
    'Case ID': ('Case ID', 'Beneficiary ID'),
}
SERVICE_FIELDS = {'Type of Service Provided', 'Type of Document', 'Service Status'}
ASSESSMENT_FIELDS = {'Type of Legal Service Needed', 'Type of documents to be issued', 'Assessment Status', 'Request for Closed Status'}
BENEFICIARY_FIELDS = {'Date of Birth', 'Age', 'Community Type', 'Nationality', 'Case ID'}


class IssueFieldValues:
    def __init__(self, frames):
        self.frames = frames
        self.columns = {}
        self.lookups = {}

    def column(self, dataset, field):
        key = dataset, field
        if key not in self.columns:
            aliases = ALIASES.get(field, (field,))
            if dataset == 'awareness' and field == 'Contact Number':
                aliases = ('Phone Number', 'Contact Number')
            if dataset == 'legalhotlines':
                aliases = next((hints for hints in HOTLINE_FIELDS.values() if hints[0] == field), aliases)
            frame = self.frames.get(dataset)
            self.columns[key] = _find(list(frame.columns), *aliases) if frame is not None else None
        return self.columns[key]

    def linked(self, dataset, field, identifier):
        if not identifier:
            return []
        key = dataset, field
        if key not in self.lookups:
            lookup = defaultdict(list)
            column = self.column(dataset, field)
            if column:
                for index, value in self.frames[dataset][column].items():
                    lookup[clean_id(value)].append(index)
            self.lookups[key] = lookup
        return self.lookups[key].get(identifier, [])

    def values(self, finding, fields):
        dataset = finding['dataset']
        frame = self.frames.get(dataset)
        index = int(finding.get('row', 0)) - 2
        own_indexes = [index] if frame is not None and index in frame.index else []
        resolved = {}
        for field in fields:
            owner, indexes = dataset, own_indexes
            if dataset == 'assessments' and field in SERVICE_FIELDS:
                owner = 'legalservices'
                indexes = self.linked(owner, 'Assessment ID', clean_id(finding.get('assessmentId', '')))
            elif dataset == 'legalservices' and field in ASSESSMENT_FIELDS:
                owner = 'assessments'
                indexes = self.linked(owner, 'Assessment ID', clean_id(finding.get('assessmentId', '')))
            elif dataset in {'assessments', 'legalservices'} and field in BENEFICIARY_FIELDS and not self.column(dataset, field):
                owner = 'beneficiaries'
                indexes = self.linked(owner, 'Case ID', clean_id(finding.get('caseId', '')))
            column = self.column(owner, field)
            values = []
            if column:
                for row_index in indexes:
                    value = str(display_value(self.frames[owner].at[row_index, column]))
                    if value and value not in values:
                        values.append(value)
            resolved[field] = '; '.join(values)
        return resolved
