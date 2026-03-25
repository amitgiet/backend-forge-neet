import sqlite3
import os

dbs = [
    ('Bio', 'uploads/biology_questions.db', 'biology'),
    ('Chem', 'uploads/chemistry_questions.db', 'chemistry'),
    ('Phy', 'uploads/npcm_phy_database.db', 'npcmPhy')
]

def find_by_text(db_path, table, text):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        # Search using LIKE
        cursor.execute(f"SELECT uniqueId, question FROM {table} WHERE question LIKE ?", (f"%{text}%",))
        rows = cursor.fetchall()
        conn.close()
        return rows
    except Exception as e:
        return [f"Error: {e}"]

search_term = "velocity-time graph"
print(f"Searching for text: '{search_term}'...")

for label, path, table in dbs:
    if not os.path.exists(path): continue
    results = find_by_text(path, table, search_term)
    if results and not isinstance(results[0], str):
        print(f"--- MATCHES in {label} ({path}) ---")
        for uniqueId, question in results:
            print(f"  ID: {uniqueId}")
            print(f"  Text: {question[:150]}...")
        print("\n")
