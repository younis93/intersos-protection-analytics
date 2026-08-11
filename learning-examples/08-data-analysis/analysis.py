import polars as pl
f=pl.DataFrame({'month':['Jan','Jan'],'total':[4,8]});print(f.group_by('month').agg(pl.col('total').sum()))
