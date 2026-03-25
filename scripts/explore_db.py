import sqlite3
import os
import sys

# Ensure UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def explore(db_name):
    print(f"--- Exploring: {db_name} ---")
    try:
        conn = sqlite3.connect(db_name)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        for table_name in tables:
            table_name = table_name[0]
            print(f"  Table: {table_name}")
            cursor.execute(f"PRAGMA table_info({table_name});")
            columns = cursor.fetchall()
            print(f"    Columns: {[c[1] for c in columns]}")
            
            cursor.execute(f"SELECT * FROM {table_name} LIMIT 3;")
            rows = cursor.fetchall()
            for i, row in enumerate(rows):
                # Clean row for printing
                clean_row = [str(r)[:50] for r in row[:10]] # Limit row length
                print(f"    Row {i+1}: {clean_row}")
        conn.close()
    except Exception as e:
        print(f"    Error: {e}")
    print("\n")

db_files = [
    "uploads/biology_questions.db",
    "uploads/chemistry_questions.db",
    "uploads/npcm_phy_database.db",
    "uploads/subject_cache.db"
]

for db in db_files:
    if os.path.exists(db):
        explore(db)
    else:
        print(f"Skipping {db} (not found)")
