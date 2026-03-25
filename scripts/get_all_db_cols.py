import sqlite3

dbs = {
    'Bio': ('uploads/biology_questions.db', 'biology'),
    'Chem': ('uploads/chemistry_questions.db', 'chemistry'),
    'Phy': ('uploads/npcm_phy_database.db', 'npcmPhy')
}

for label, (path, table) in dbs.items():
    print(f"--- {label} ({path}) ---")
    try:
        conn = sqlite3.connect(path)
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({table})")
        cols = [c[1] for c in cursor.fetchall()]
        for col in cols:
            print(f"  - {col}")
        conn.close()
    except Exception as e:
        print(f"  Error: {e}")
    print("\n")
