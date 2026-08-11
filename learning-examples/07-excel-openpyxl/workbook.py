from openpyxl import Workbook
b=Workbook();b.active.append(['Month','Total']);b.active.append(['Jan',12]);b.save('demo.xlsx');print('Created demo.xlsx')
