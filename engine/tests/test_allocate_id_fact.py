import json

from allocate_id import next_fact_id, peek_fact_id


def test_first_fact_id_and_ledger(tmp_path):
    (tmp_path / "facts").mkdir()
    assert peek_fact_id(root=tmp_path) == "F-00001"
    assert next_fact_id(root=tmp_path) == "F-00001"
    assert json.loads((tmp_path / "facts" / ".id-seq.json").read_text()) == {"fact": 1}
    assert next_fact_id(root=tmp_path) == "F-00002"


def test_ledger_survives_a_department_allocation(tmp_path):
    """QF-21: the fact counter is global and disjoint from department ledgers."""
    from allocate_id import next_process_id
    (tmp_path / "facts").mkdir()
    (tmp_path / "departments" / "cooking" / "processes").mkdir(parents=True)
    assert next_fact_id(root=tmp_path) == "F-00001"
    next_process_id("cooking", root=tmp_path)
    assert next_fact_id(root=tmp_path) == "F-00002"


def test_missing_facts_dir_is_created(tmp_path):
    assert next_fact_id(root=tmp_path) == "F-00001"
    assert (tmp_path / "facts" / ".id-seq.json").exists()


def test_peek_does_not_persist(tmp_path):
    peek_fact_id(root=tmp_path)
    assert not (tmp_path / "facts" / ".id-seq.json").exists()
