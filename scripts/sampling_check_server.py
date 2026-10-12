"""Synthetic, memory-only API for check_sampling.cjs. Never loads user imports."""
import pandas as pd
from fastapi import FastAPI
from fastapi.responses import Response
from backend.sampling import LEADING, export, table

rows = []
for index in range(205):
    row = {names[0]: "" for _, *names in LEADING}
    row.update({"Service ID": str(index), "Beneficiary ID": str(index // 2), "Projects": "P1" if index % 3 else "P2",
                "Project Location": "L1" if index % 4 else "L2", "Name": "اسم عربي" if index % 5 == 0 else f"Person {index:03}",
                "Gender": "Male ذكر" if index % 2 else "Female أنثى", "Contact Number": f"77{index // 2:08}",
                "Service Status": "Completed اکتملت", "Type of Service Provided": "Legal Representation - تمثيل",
                "Date Service Completed": "01/01/2026" if index < 103 else "01/02/2026"})
    rows.append(row)
source = pd.DataFrame(rows).rename(columns={"Name": "Name / الأسم", "Projects": "Projects - المشروع"})
app = FastAPI()


@app.post("/api/legal/sampling")
def sampling(query: dict):
    return table(source, **query)


@app.post("/api/legal/sampling/export")
def sampling_export(query: dict):
    return Response(export(source, **query), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
