import sqlite3
import os

dbs = [
    ('Bio', 'uploads/biology_questions.db'),
    ('Chem', 'uploads/chemistry_questions.db'),
    ('Phy', 'uploads/npcm_phy_database.db'),
    ('Cache', 'uploads/subject_cache.db')
]

def find_id(db_path, target_id):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [t[0] for t in cursor.fetchall()]
    
    for table in tables:
        try:
            cursor.execute(f"PRAGMA table_info(\"{table}\")")
            cols = [c[1] for c in cursor.fetchall()]
            
            id_col = None
            if 'uniqueId' in cols: id_col = 'uniqueId'
            elif 'id' in cols: id_col = 'id'
            
            if id_col:
                cursor.execute(f"SELECT * FROM \"{table}\" WHERE {id_col} = ?", (target_id,))
                row = cursor.fetchone()
                if row:
                    return table, row, cols
        except:
            pass
    conn.close()
    return None

target = 31312
print(f"Searching for {target} in all databases...")

for label, path in dbs:
    if not os.path.exists(path): continue
    result = find_id(path, target)
    if result:
        table, row, cols = result
        print(f"--- MATCH FOUND in {label} ({path}) ---")
        print(f"  Table: {table}")
        for i, val in enumerate(row):
            if i < len(cols):
                print(f"  {cols[i]}: {str(val)[:100]}")
        print("\n")
