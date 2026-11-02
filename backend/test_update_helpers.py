"""Explicit review decisions for tests of existing source-replacement behavior."""
def skip_comparison(client, workspace, token, body):
    path=f'/api/{workspace}/'+('columns' if workspace=='custom' else 'imports')+f'/{token}/update-preview'
    response=client.post(path,json={**body,'matching':{'skip':True}})
    return {'skip':True,'signature':response.json()['signature']} if response.status_code==200 else None
