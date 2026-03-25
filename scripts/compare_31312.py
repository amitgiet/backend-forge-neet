import sqlite3
import sys

# Set UTF-8
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

dbs = [
    ('Bio', 'uploads/biology_questions.db', 'biology'),
    ('Chem', 'uploads/chemistry_questions.db', 'chemistry'),
    ('Phy', 'uploads/npcm_phy_database.db', 'npcmPhy')
]

for label, path, table in dbs:
    print(f"--- Subject Category: {label} ---")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM {table} WHERE uniqueId = 31312")
    row = cursor.fetchone()
    if row:
        for k in row.keys():
            print(f"  {k}: {row[k]}")
    else:
        print("  Not Found.")
    conn.close()
    print("\n")
