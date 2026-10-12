import pytest

from backend.legal_platform import LegalStore
from backend.test_legal_platform import csv, required_payload


@pytest.mark.parametrize('service_project', [True, False])
def test_workload_preserves_distinct_ids_raw_completion_counts_and_missing_projects(service_project):
    payload = required_payload()
    payload['assessments'] = csv(**{
        'Assessment ID': ['A1', 'A1', 'A2', 'A3'],
        'Beneficiary ID': ['B1'] * 4,
        'Date of Assessment': ['01/01/2026', '01/01/2026', '01/02/2026', '02/02/2026'],
        'Lawyers': [' One ', 'One', 'One', 'One'],
        'Project': [' P ', 'P', 'P', 'Q'],
    })
    services = {
        'Service ID': ['S1', 'S1'], 'Assessment ID': ['A1', 'A1'],
        'Beneficiary ID': ['B1', 'B1'], 'Lawyer': [' One ', 'One'],
        'Service Status': ['Completed', 'Closed'],
    }
    if service_project: services['Project'] = ['P', ' P ']
    payload['legalservices'] = csv(**services)
    payload['legalfees'] = csv(**{
        'Fee ID': ['F1', 'F1'], 'Created by': [' One ', 'One'],
        'Project': ['P', ' P '], 'Amount Spent': ['100', '200'],
    })
    store = LegalStore.from_files(payload, 'test')
    result = store.intelligence('lawyer-intelligence')
    rows = {row['project']: row for row in result['lawyers']}
    assert rows['P']['assessments'] == 2
    assert rows['P']['monthlyAverage'] == 1.5
    assert rows['P']['services'] == 1
    assert rows['P']['completedServices'] == 2
    assert rows['P']['completionRate'] == 2
    assert rows['P']['fees'] == 1
    assert rows['P']['averageCost'] == 150
    assert rows['Q']['assessments'] == 1
    assert rows['Q']['services'] == (0 if service_project else 1)
    assert store.intelligence('lawyer-intelligence') == result
    assert store.intelligence('lawyer-intelligence', {'lawyer': ['__missing__']})['lawyers'] == []
