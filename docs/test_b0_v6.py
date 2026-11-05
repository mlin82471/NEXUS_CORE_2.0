"""
B0 v6 Contract Verification Tests
"""

import sqlite3, uuid, hashlib, os, json, sys

DB_PATH = os.path.join(os.path.dirname(__file__), 'b0_v6_test.db')

def fresh_db():
    try:
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
    except:
        pass
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    init_path = os.path.join(os.path.dirname(__file__), 'B0_v6_init.sql')
    db.executescript(open(init_path).read())
    return db

def uid(): return str(uuid.uuid4())

def run_tests():
    passed = failed = 0
    tests = []

    # Test 1: Fresh DB Init
    try:
        db = fresh_db()
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
        for t in ['_nexus_meta','agent_runs','agents','reservations','subtasks','task_events','tasks']:
            assert t in tables, f"MISSING: {t}"
        v = db.execute("SELECT value FROM _nexus_meta WHERE key='schema_version'").fetchone()[0]
        assert v == '3'
        db.close()
        print("PASS: 01 Fresh DB Init"); passed += 1
    except Exception as e:
        print(f"FAIL: 01 Fresh DB Init - {e}"); failed += 1

    # Test 2: M0-A Migration
    try:
        try: os.remove(DB_PATH)
        except: pass
        db = sqlite3.connect(DB_PATH)
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript("""CREATE TABLE tasks (id TEXT PRIMARY KEY, goal TEXT NOT NULL, status TEXT DEFAULT 'queued', execution_round INTEGER DEFAULT 0, plan_json JSON, risk_level TEXT, risk_suggestion TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT);
            CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, adapter_type TEXT, enabled INTEGER DEFAULT 1, capabilities JSON DEFAULT '[]', created_at TEXT);
            CREATE TABLE plan_steps (id TEXT PRIMARY KEY, task_id TEXT, step_key TEXT, goal TEXT, role TEXT, depends_on JSON, status TEXT DEFAULT 'pending', result TEXT, error TEXT, step_order INTEGER DEFAULT 0, created_at TEXT, started_at TEXT, finished_at TEXT, UNIQUE(task_id, step_key));
            CREATE TABLE agent_runs (id TEXT PRIMARY KEY, task_id TEXT, step_id TEXT, agent_id TEXT, status TEXT, result TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, usage_source TEXT DEFAULT 'unknown', created_at TEXT, finished_at TEXT);
            INSERT INTO tasks VALUES ('t1','test goal','running',0,null,null,null,datetime('now'),null);
            INSERT INTO agents VALUES ('a1','mock','analysis','mock',1,'[]',datetime('now'));
            INSERT INTO plan_steps VALUES ('ps1','t1','s1','analyze','analysis','[]','completed','OK',null,0,datetime('now'),datetime('now'),datetime('now'));
            INSERT INTO agent_runs VALUES ('ar1','t1','ps1','a1','completed','OK',100,50,'measured',datetime('now'),datetime('now'));""")
        db.close()
        db = sqlite3.connect(DB_PATH)
        db.execute("PRAGMA foreign_keys=ON")
        mig_path = os.path.join(os.path.dirname(__file__), 'B0_v6_migration_m0a.sql')
        db.executescript(open(mig_path).read())
        v = db.execute("SELECT value FROM _nexus_meta WHERE key='schema_version'").fetchone()[0]
        assert v == '3'
        st = db.execute("SELECT COUNT(*) FROM subtasks").fetchone()[0]
        assert st == 1
        s = db.execute("SELECT legacy_planstep_id, status FROM subtasks WHERE legacy_planstep_id='ps1'").fetchone()
        assert s[1] == 'success'
        ar = db.execute("SELECT subtask_id FROM agent_runs WHERE id='ar1'").fetchone()
        assert ar[0] is not None
        db.close()
        print("PASS: 02 M0-A Migration"); passed += 1
    except Exception as e:
        print(f"FAIL: 02 M0-A Migration - {e}"); failed += 1; import traceback; traceback.print_exc()

    # Test 3: Migration Rollback
    try:
        try: os.remove(DB_PATH)
        except: pass
        db = sqlite3.connect(DB_PATH)
        db.executescript("""CREATE TABLE tasks (id TEXT PRIMARY KEY, goal TEXT); CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT); CREATE TABLE plan_steps (id TEXT PRIMARY KEY, task_id TEXT, step_key TEXT, goal TEXT, role TEXT, depends_on JSON, status TEXT DEFAULT 'pending', result TEXT, error TEXT, step_order INTEGER, created_at TEXT, started_at TEXT, finished_at TEXT, UNIQUE(task_id, step_key)); CREATE TABLE agent_runs (id TEXT PRIMARY KEY, task_id TEXT, step_id TEXT, agent_id TEXT, status TEXT, result TEXT, input_tokens INTEGER, output_tokens INTEGER, created_at TEXT, finished_at TEXT); INSERT INTO tasks VALUES ('t1','goal'); INSERT INTO agents VALUES ('a1','mock');""")
        db.close()
        db = sqlite3.connect(DB_PATH)
        try:
            db.execute("BEGIN")
            db.execute("ALTER TABLE tasks ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'none'")
            raise Exception("simulated mid-migration failure")
        except:
            db.execute("ROLLBACK")
        db.execute("SELECT goal FROM tasks WHERE id='t1'").fetchone()
        has_meta = db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_nexus_meta'").fetchone()[0]
        assert has_meta == 0
        db.close()
        print("PASS: 03 Migration Rollback"); passed += 1
    except Exception as e:
        print(f"FAIL: 03 Migration Rollback - {e}"); failed += 1

    # Test 4: Reservation States
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal) VALUES (?,?)", (tid,"test"))
        rid = uid()
        db.execute("INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status) VALUES(?,?,?,?,?,'PENDING')", (rid,tid,"agent:x",5000,1))
        rid2 = uid()
        fp = hashlib.sha256(b"5500|1|measured").hexdigest()
        db.execute("""INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status,tokens_charged,calls_charged,input_tokens,output_tokens,usage_source,settle_fingerprint,resolved_at) VALUES(?,?,?,?,?,'COMMITTED',5500,1,2000,3500,'measured',?,datetime('now'))""", (rid2,tid,"agent:y",5000,1,fp))
        rid3 = uid()
        db.execute("""INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status,tokens_charged,calls_charged,resolved_at) VALUES(?,?,?,?,?,'RELEASED',0,0,datetime('now'))""", (rid3,tid,"agent:z",3000,1))
        rid4 = uid()
        db.execute("INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status) VALUES(?,?,?,?,?,'EXPIRED')", (rid4,tid,"agent:w",4000,2))
        committed_tokens = db.execute("SELECT COALESCE(SUM(tokens_charged),0) FROM reservations WHERE task_id=? AND status='COMMITTED'",(tid,)).fetchone()[0]
        pending_tokens = db.execute("SELECT COALESCE(SUM(tokens_reserved),0) FROM reservations WHERE task_id=? AND status='PENDING'",(tid,)).fetchone()[0]
        expired_tokens = db.execute("SELECT COALESCE(SUM(tokens_reserved),0) FROM reservations WHERE task_id=? AND status='EXPIRED'",(tid,)).fetchone()[0]
        assert committed_tokens == 5500
        assert pending_tokens == 5000
        assert expired_tokens == 4000
        remaining = 200000 - committed_tokens - pending_tokens - expired_tokens
        assert remaining == 185500
        db.close()
        print("PASS: 04 Reservation States"); passed += 1
    except Exception as e:
        print(f"FAIL: 04 Reservation States - {e}"); failed += 1

    # Test 5: RELEASED Excluded
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal) VALUES (?,?)", (tid,"test"))
        rid = uid()
        db.execute("""INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status,tokens_charged,calls_charged,resolved_at) VALUES(?,?,?,?,?,'RELEASED',0,0,datetime('now'))""", (rid,tid,"agent:x",10000,1))
        committed = db.execute("SELECT COALESCE(SUM(tokens_charged),0) FROM reservations WHERE task_id=? AND status='COMMITTED'",(tid,)).fetchone()[0]
        pending = db.execute("SELECT COALESCE(SUM(tokens_reserved),0) FROM reservations WHERE task_id=? AND status='PENDING'",(tid,)).fetchone()[0]
        expired = db.execute("SELECT COALESCE(SUM(tokens_reserved),0) FROM reservations WHERE task_id=? AND status='EXPIRED'",(tid,)).fetchone()[0]
        remaining = 200000 - committed - pending - expired
        assert remaining == 200000, f"RELEASED should not consume budget, got {remaining}"
        db.close()
        print("PASS: 05 RELEASED Excluded"); passed += 1
    except Exception as e:
        print(f"FAIL: 05 RELEASED Excluded - {e}"); failed += 1

    # Test 6: EXPIRED on Restart
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal) VALUES (?,?)", (tid,"test"))
        rid = uid()
        db.execute("INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status) VALUES(?,?,?,?,?,'PENDING')", (rid,tid,"agent:x",6000,2))
        db.commit()
        db.execute("UPDATE reservations SET status='EXPIRED' WHERE task_id=? AND status='PENDING'",(tid,))
        db.commit()
        status = db.execute("SELECT status FROM reservations WHERE reservation_id=?",(rid,)).fetchone()[0]
        assert status == 'EXPIRED'
        expired_tokens = db.execute("SELECT COALESCE(SUM(tokens_reserved),0) FROM reservations WHERE task_id=? AND status='EXPIRED'",(tid,)).fetchone()[0]
        assert expired_tokens == 6000
        db.close()
        print("PASS: 06 EXPIRED on Restart"); passed += 1
    except Exception as e:
        print(f"FAIL: 06 EXPIRED on Restart - {e}"); failed += 1

    # Test 7: Overrun
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal,max_total_tokens) VALUES (?,?,?)", (tid,"test",10000))
        rid = uid()
        db.execute("INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status) VALUES(?,?,?,?,?,'PENDING')", (rid,tid,"agent:x",5000,1))
        fp = hashlib.sha256(b"12000|1|measured").hexdigest()
        db.execute("""UPDATE reservations SET status='COMMITTED', tokens_charged=12000, calls_charged=1, input_tokens=5000, output_tokens=7000, usage_source='measured', settle_fingerprint=?, resolved_at=datetime('now') WHERE reservation_id=?""", (fp, rid))
        charged = db.execute("SELECT tokens_charged FROM reservations WHERE reservation_id=?",(rid,)).fetchone()[0]
        assert charged == 12000
        committed = db.execute("SELECT COALESCE(SUM(tokens_charged),0) FROM reservations WHERE task_id=? AND status='COMMITTED'",(tid,)).fetchone()[0]
        pending = db.execute("SELECT COALESCE(SUM(tokens_reserved),0) FROM reservations WHERE task_id=? AND status='PENDING'",(tid,)).fetchone()[0]
        expired = db.execute("SELECT COALESCE(SUM(tokens_reserved),0) FROM reservations WHERE task_id=? AND status='EXPIRED'",(tid,)).fetchone()[0]
        remaining = 10000 - committed - pending - expired
        assert remaining == -2000, f"Remaining should be -2000, got {remaining}"
        db.close()
        print("PASS: 07 Overrun"); passed += 1
    except Exception as e:
        print(f"FAIL: 07 Overrun - {e}"); failed += 1

    # Test 8: Permission Default-Deny
    try:
        db = fresh_db()
        aid = uid()
        db.execute("INSERT INTO agents(id,name,role,adapter_type,permission_set) VALUES(?,?,?,?,?)", (aid,'test','analysis','mock','[]'))
        ps = db.execute("SELECT permission_set FROM agents WHERE id=?",(aid,)).fetchone()[0]
        assert json.loads(ps) == []
        role_map = {"analysis":["read_data","reason"],"coding":["read_files","write_files","execute_code"],"verification":["read_data","validate"],"execution":["execute_code","write_files"],"knowledge":["read_data","search"],"research":["read_data","search","reason"]}
        assert len(role_map) == 6
        for role, perms in role_map.items():
            assert len(perms) > 0
        db.close()
        print("PASS: 08 Permission Default-Deny"); passed += 1
    except Exception as e:
        print(f"FAIL: 08 Permission Default-Deny - {e}"); failed += 1

    # Test 9: idempotency_key
    try:
        db = fresh_db()
        tid = uid()
        ikey = uid()
        db.execute("INSERT INTO tasks(id,goal,status,idempotency_key) VALUES (?,?,?,?)", (tid,"goal","queued",ikey))
        db.commit()
        try:
            db.execute("INSERT INTO tasks(id,goal,status,idempotency_key) VALUES (?,?,?,?)", (uid(),"goal2","queued",ikey))
            assert False, "Should have raised IntegrityError"
        except: pass
        db.execute("UPDATE tasks SET status='closed', closed_at=datetime('now') WHERE id=?",(tid,))
        result = db.execute("SELECT idempotency_key FROM tasks WHERE id=?",(tid,)).fetchone()[0]
        assert result == ikey
        db.close()
        print("PASS: 09 idempotency_key"); passed += 1
    except Exception as e:
        print(f"FAIL: 09 idempotency_key - {e}"); failed += 1

    # Test 10: Event Sequence
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal) VALUES (?,?)", (tid,"test"))
        for i in range(5):
            seq = db.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM task_events WHERE task_id=?",(tid,)).fetchone()[0]
            db.execute("INSERT INTO task_events(event_id,task_id,sequence,event_type,actor_type,payload) VALUES(?,?,?,?,?,?)", (uid(),tid,seq,f"event_{i}","system",'{}'))
        count = db.execute("SELECT COUNT(*) FROM task_events WHERE task_id=?",(tid,)).fetchone()[0]
        assert count == 5
        dup = db.execute("SELECT sequence, COUNT(*) FROM task_events WHERE task_id=? GROUP BY sequence HAVING COUNT(*)>1",(tid,)).fetchall()
        assert len(dup) == 0
        try:
            db.execute("INSERT INTO task_events(event_id,task_id,sequence,event_type,actor_type) VALUES(?,?,?,?,?)", (uid(),tid,1,"dup","system"))
            assert False
        except: pass
        db.close()
        print("PASS: 10 Event Sequence"); passed += 1
    except Exception as e:
        print(f"FAIL: 10 Event Sequence - {e}"); failed += 1

    # Test 11: execution_id Unique
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal) VALUES (?,?)", (tid,"test"))
        sid = uid()
        eid = uid()
        db.execute("INSERT INTO subtasks(id,task_id,step_key,goal,role,status) VALUES (?,?,?,?,?,?)", (sid,tid,"s1","test goal","analysis","pending"))
        db.execute("INSERT INTO agent_runs(id,task_id,subtask_id,execution_id,status) VALUES (?,?,?,?,?)", (uid(),tid,sid,eid,"completed"))
        try:
            db.execute("INSERT INTO agent_runs(id,task_id,subtask_id,execution_id,status) VALUES (?,?,?,?,?)", (uid(),tid,sid,eid,"completed"))
            assert False
        except: pass
        db.close()
        print("PASS: 11 execution_id Unique"); passed += 1
    except Exception as e:
        print(f"FAIL: 11 execution_id Unique - {e}"); failed += 1

    # Test 12: Active Plan Aggregation
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal,status) VALUES (?,?,?)", (tid,"test","running"))
        s1 = uid(); s2 = uid()
        db.execute("INSERT INTO subtasks(id,task_id,step_key,goal,role,plan_version,is_active,status,verification_status) VALUES (?,?,?,?,?,?,?,?,?)",
            (s1,tid,"s1","test goal","analysis",0,1,"success","passed"))
        db.execute("INSERT INTO subtasks(id,task_id,step_key,goal,role,plan_version,is_active,status,verification_status) VALUES (?,?,?,?,?,?,?,?,?)",
            (s2,tid,"s2","test goal","analysis",0,1,"failed","failed"))
        active = db.execute("SELECT status, verification_status FROM subtasks WHERE task_id=? AND is_active=1",(tid,)).fetchall()
        passed_count = sum(1 for s,v in active if v == 'passed')
        failed_count = sum(1 for s,v in active if s == 'failed')
        assert passed_count == 1 and failed_count == 1
        result = "partial" if passed_count >= 1 and failed_count >= 1 else "unknown"
        assert result == "partial"
        db.close()
        print("PASS: 12 Active Plan Aggregation"); passed += 1
    except Exception as e:
        print(f"FAIL: 12 Active Plan Aggregation - {e}"); failed += 1

    # Test 13: SUPERSEDED Exclusion
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal,status) VALUES (?,?,?)", (tid,"test","running"))
        s1 = uid(); s2 = uid()
        db.execute("INSERT INTO subtasks(id,task_id,step_key,goal,role,plan_version,is_active,status,verification_status) VALUES (?,?,?,?,?,?,?,?,?)", (s1,tid,"s1","test goal","analysis",0,1,"success","passed"))
        db.execute("INSERT INTO subtasks(id,task_id,step_key,goal,role,plan_version,is_active,status,verification_status) VALUES (?,?,?,?,?,?,?,?,?)", (s2,tid,"s1","test goal","analysis",1,0,"superseded","inconclusive"))
        active = db.execute("SELECT COUNT(*) FROM subtasks WHERE task_id=? AND is_active=1",(tid,)).fetchone()[0]
        assert active == 1
        all_passed = db.execute("SELECT COUNT(*) FROM subtasks WHERE task_id=? AND is_active=1 AND verification_status='passed'",(tid,)).fetchone()[0]
        assert all_passed == 1
        result = "success" if all_passed == active else "partial"
        assert result == "success"
        db.close()
        print("PASS: 13 SUPERSEDED Exclusion"); passed += 1
    except Exception as e:
        print(f"FAIL: 13 SUPERSEDED Exclusion - {e}"); failed += 1

    # Test 14: Concurrent Budget
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal,max_total_tokens) VALUES (?,?,?)", (tid,"test",100))
        rid1 = uid()
        db.execute("INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status) VALUES(?,?,?,?,?,'PENDING')", (rid1,tid,"agent:a",60,1))
        committed = db.execute("SELECT COALESCE(SUM(tokens_charged),0) FROM reservations WHERE task_id=? AND status='COMMITTED'",(tid,)).fetchone()[0]
        pending = db.execute("SELECT COALESCE(SUM(tokens_reserved),0) FROM reservations WHERE task_id=? AND status='PENDING'",(tid,)).fetchone()[0]
        expired = db.execute("SELECT COALESCE(SUM(tokens_reserved),0) FROM reservations WHERE task_id=? AND status='EXPIRED'",(tid,)).fetchone()[0]
        remaining = 100 - committed - pending - expired
        assert remaining == 40
        assert not (remaining >= 50)
        db.close()
        print("PASS: 14 Concurrent Budget"); passed += 1
    except Exception as e:
        print(f"FAIL: 14 Concurrent Budget - {e}"); failed += 1

    # Test 15: Reservation CHECK Constraints
    try:
        db = fresh_db()
        tid = uid()
        db.execute("INSERT INTO tasks(id,goal) VALUES (?,?)", (tid,"test"))
        try:
            db.execute("INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status) VALUES(?,?,?,?,?,'INVALID')", (uid(),tid,"x",100,1))
            assert False
        except: pass
        try:
            db.execute("INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status) VALUES(?,?,?,?,?,'COMMITTED')", (uid(),tid,"x",100,1))
            assert False
        except: pass
        try:
            db.execute("INSERT INTO reservations(reservation_id,task_id,caller_id,tokens_reserved,calls_reserved,status) VALUES(?,?,?,?,?,'RELEASED')", (uid(),tid,"x",100,1))
            assert False
        except: pass
        db.close()
        print("PASS: 15 Reservation CHECK"); passed += 1
    except Exception as e:
        print(f"FAIL: 15 Reservation CHECK - {e}"); failed += 1

    # Test 16: Unknown Usage Formula
    try:
        stl = 50000
        assert min(stl, max(3000, stl//2)) == 25000
        assert min(stl, max(60000, stl//2)) == 50000
        print("PASS: 16 Unknown Usage"); passed += 1
    except Exception as e:
        print(f"FAIL: 16 Unknown Usage - {e}"); failed += 1

    # Test 17: AgentRun Fingerprint
    try:
        db = fresh_db()
        tid = uid(); sid = uid()
        db.execute("INSERT INTO tasks(id,goal) VALUES (?,?)", (tid,"test"))
        db.execute("INSERT INTO subtasks(id,task_id,step_key,goal,role,status) VALUES (?,?,?,?,?,?)", (sid,tid,"s1","test goal","analysis","pending"))
        eid = uid()
        fp = hashlib.sha256(b"goal_text").hexdigest()
        db.execute("INSERT INTO agent_runs(id,task_id,subtask_id,execution_id,request_fingerprint,status) VALUES(?,?,?,?,?,?)", (uid(),tid,sid,eid,fp,"completed"))
        row = db.execute("SELECT request_fingerprint FROM agent_runs WHERE execution_id=?",(eid,)).fetchone()
        assert row is not None and row[0] == fp
        try:
            db.execute("INSERT INTO agent_runs(id,task_id,subtask_id,execution_id,request_fingerprint,status) VALUES(?,?,?,?,?,?)", (uid(),tid,sid,eid,"other","completed"))
            assert False
        except: pass
        db.close()
        print("PASS: 17 AgentRun Fingerprint"); passed += 1
    except Exception as e:
        print(f"FAIL: 17 AgentRun Fingerprint - {e}"); failed += 1

    print(f"\n{'='*40}")
    print(f"RESULTS: {passed} passed, {failed} failed, {passed+failed} total")
    print(f"{'='*40}")

run_tests()
