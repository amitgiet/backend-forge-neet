import sqlite3
import os
import sys

# Ensure UTF-8 output
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

db_files = [
    ('Bio', 'uploads/biology_questions.db'),
    ('Chem', 'uploads/chemistry_questions.db'),
    ('Phy', 'uploads/npcm_phy_database.db'),
    ('Cache', 'uploads/subject_cache.db')
]

with open('scripts/schema_dump.txt', 'w', encoding='utf-8') as f:
    for label, path in db_files:
        f.write(f"========================================================\n")
        f.write(f" DATABASE: {label} ({path})\n")
        f.write(f"========================================================\n")
        if not os.path.exists(path):
            f.write("  -> FILE NOT FOUND\n\n")
            continue
            
        try:
            conn = sqlite3.connect(path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [t[0] for t in cursor.fetchall()]
            f.write(f"  Total Tables: {len(tables)}\n")
            
            # Print details for a few key tables (like biology, biologyHindi, chemistry, chemistryHindi, npcmPhy, npcmPhyHindi)
            # or any table with less than 50 tables in the DB to avoid dumping thousands of 'uidsXXX' tables.
            if len(tables) > 100:
                key_tables = [t for t in tables if 'uid' not in t.lower() and 'chapter' not in t.lower()]
                f.write(f"  Showing schema for key tables only: {key_tables}\n\n")
            else:
                key_tables = tables
                f.write(f"  Tables: {tables}\n\n")
                
            for table in key_tables:
                f.write(f"  --- TABLE: {table} ---\n")
                cursor.execute(f"PRAGMA table_info(\"{table}\")")
                cols = [c[1] for c in cursor.fetchall()]
                f.write(f"    Columns: {', '.join(cols)}\n")
                
                # Sample row
                try:
                    cursor.execute(f"SELECT * FROM \"{table}\" LIMIT 1")
                    row = cursor.fetchone()
                    if row:
                        f.write(f"    Sample Row (1st item):\n")
                        for k in row.keys():
                            val = str(row[k])
                            if len(val) > 100: val = val[:100] + "..."
                            f.write(f"      {k}: {val}\n")
                    else:
                        f.write(f"    (Table is empty)\n")
                except Exception as ex:
                    f.write(f"    Error reading table data: {ex}\n")
                f.write("\n")
                
            conn.close()
        except Exception as e:
            f.write(f"  Error accessing DB: {e}\n\n")
            
print("Schema dump saved to scripts/schema_dump.txt")
