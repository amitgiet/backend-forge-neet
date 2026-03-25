import sqlite3

db = 'uploads/npcm_phy_database.db'
conn = sqlite3.connect(db)
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(npcmPhy)")
for c in cursor.fetchall():
    print(c[1])
conn.close()
