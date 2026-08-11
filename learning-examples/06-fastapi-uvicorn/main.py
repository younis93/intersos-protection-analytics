from fastapi import FastAPI
app=FastAPI()
@app.get('/summary')
def summary(): return {'total':12,'source':'synthetic'}
