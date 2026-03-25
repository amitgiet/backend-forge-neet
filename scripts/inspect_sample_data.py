import sqlite3

dbs = [
    ('Bio', 'uploads/biology_questions.db', 'biology'),
    ('Chem', 'uploads/chemistry_questions.db', 'chemistry'),
    ('Phy', 'uploads/npcm_phy_database.db', 'npcmPhy')
]

with open('scripts/db_inspector_results.txt', 'w', encoding='utf-8') as f:
    for label, path, table in dbs:
        f.write(f"--- {label} ({path}) ---\n")
        try:
            conn = sqlite3.connect(path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(f"SELECT * FROM {table} LIMIT 1")
            row = cursor.fetchone()
            if row:
                for key in row.keys():
                    f.write(f"  {key}: {row[key]}\n")
            else:
                f.write("  No data found.\n")
            conn.close()
        except Exception as e:
            f.write(f"  Error: {e}\n")
        f.write("\n")
