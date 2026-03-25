import sqlite3

db = 'uploads/biology_questions.db'
conn = sqlite3.connect(db)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [t[0] for t in cursor.fetchall()]
print(f"Total Tables: {len(tables)}")
print("First 20 tables:", tables[:20])
if '31312' in [str(t) for t in tables]:
    print("Found a table named '31312'!")
conn.close()
