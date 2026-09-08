"""The two cards the unit reads. They are transcribed from the checker, so
they are tested against it: a retune of the lint that leaves the prompt behind
fails here rather than in a run."""
from facts_plan.build import cards
from merge_facts import SEGMENT_RE
from merge_facts.content import COLLOQUIAL, KEYWORDS, PIPELINE_WORDS


def test_expression_card_agrees_with_the_checker():
    expression, _ = cards()
    for keyword in KEYWORDS:
        assert keyword in expression, keyword
    assert SEGMENT_RE.pattern in expression
    assert "sum over" in expression
    assert '"param"' in expression


def test_style_card_names_every_word_the_lint_refuses():
    _, style = cards()
    for word in PIPELINE_WORDS + COLLOQUIAL:
        assert word in style, word


def _schema():
    """The schema the card renders from — the **delta**, because that is the
    one `validate_unit` holds a unit's document to."""
    from engine_common import read_json, schema_dir
    return read_json(schema_dir() / "facts-delta.schema.json")


def _enums_and_required(node, defs, seen):
    """Every `enum` value and every `required` key reachable from `node`."""
    name = (node.get("$ref") or "").rsplit("/", 1)[-1] or None
    if name:
        if name in seen:
            return [], []
        seen, node = seen | {name}, defs[name]
    enums = list(node.get("enum") or [])
    required = list(node.get("required") or [])
    children = list((node.get("properties") or {}).values())
    if isinstance(node.get("items"), dict):
        children.append(node["items"])
    for key in ("oneOf", "anyOf", "allOf"):
        children += list(node.get(key) or [])
    for key in ("if", "then"):
        if isinstance(node.get(key), dict):
            children.append(node[key])
    for child in children:
        more_enums, more_required = _enums_and_required(child, defs, seen)
        enums += more_enums
        required += more_required
    return enums, required


def test_the_shape_card_agrees_with_the_schema():
    """The card is the contract the unit is shown and `validate facts-unit` is
    the contract it is held to; a value in one and not the other is the
    2026-09-07 run again. So every enum value and every required key of the
    five payloads has to appear in the rendered card."""
    from facts_plan.build import KIND_DATA, WRITABLE_KINDS, shape_card
    schema = _schema()
    card = shape_card(WRITABLE_KINDS, schema)
    for kind, data_def in KIND_DATA.items():
        enums, required = _enums_and_required(
            {"$ref": f"#/$defs/{data_def}"}, schema["$defs"], set())
        for value in enums:
            if value is None:
                continue
            assert str(value) in card, f"{kind}: enum value {value!r}"
        for key in required:
            assert key in card, f"{kind}: required key {key!r}"


def test_the_shape_card_spells_location_out_per_medium():
    """§3.3 — the paper form is the case the first run had no shape for.

    The four lines are read off the schema's own `if`/`then` pairs, so they
    carry exactly the keys Task 2 closed each medium to and star exactly the
    ones it made required: only `paper` and `external` require anything.
    """
    from facts_plan.build import shape_card
    card = shape_card(("record",), _schema())
    assert "medium=paper: holder*، kept_at*" in card
    assert ("medium=sheet: hidden، path، sheet، sheetId، spreadsheetId"
            in card)
    assert "medium=external: identifier_scheme، kept_at*، system*" in card
    assert "medium=native: identifier_scheme، kept_at" in card


def test_the_three_worked_examples_validate_against_the_store_contract():
    """The examples are what a unit copies. One that does not validate teaches
    the shape Stage V refuses."""
    from engine_common import validate
    from facts_plan.build import EXAMPLES
    assert [e["kind"] for e in EXAMPLES] == ["record", "measurement", "rule"]
    assert EXAMPLES[0]["data"]["medium"] == "paper"
    assert set(EXAMPLES[0]["data"]["location"]) == {"kept_at", "holder"}
    validate("facts-delta.schema.json", {"schema_version": 2, "entries": [
        dict(entry, scope={"departments": ["cooking"], "branches": []},
             source=[{"type": "chat", "ref": None}], retired=False)
        for entry in EXAMPLES]})


def test_the_two_schemas_carry_the_same_payload_definitions():
    """The card renders from `facts-delta.schema.json` and the store keeps
    `facts.schema.json`. The five payloads are one definition in two files but
    for a single deliberate key — a unit hands over a rule's verbatim text as
    `original` and `merge facts apply` writes it out and keeps the path as
    `original_ref` — so anything else drifting apart means the card is
    documenting a contract the other half does not enforce."""
    from engine_common import read_json, schema_dir
    from facts_plan.build import KIND_DATA
    store = read_json(schema_dir() / "facts.schema.json")["$defs"]
    delta = read_json(schema_dir() / "facts-delta.schema.json")["$defs"]
    for data_def in KIND_DATA.values():
        one, two = (dict(store[data_def]), dict(delta[data_def]))
        one["properties"] = {k: v for k, v in one["properties"].items()
                             if k != "original_ref"}
        two["properties"] = {k: v for k, v in two["properties"].items()
                             if k != "original"}
        assert one == two, data_def
    assert "original_ref" not in delta["ruleData"]["properties"]
    assert "original" not in store["ruleData"]["properties"]


def test_the_shape_card_stays_inside_a_unit_s_budget():
    """It is appended to every `units/*/input.md`, so its size is a standing
    charge on the 20 K input budget (§2.3). This is the alarm, not a target:
    when the schema grows past it, someone decides what the card drops."""
    from facts_plan.build import (MAX_LINE, WRITABLE_KINDS, estimate_tokens,
                                  shape_section)
    text = shape_section()
    assert 1200 <= estimate_tokens(text) <= 3500
    assert max(len(line) for line in text.split("\n")) <= MAX_LINE
    assert shape_section() == text                       # deterministic
    assert "Shape card" in text and set(WRITABLE_KINDS)


def test_render_input_carries_the_shape_section_after_the_expression_card():
    from facts_plan.build import render_input
    skeleton = {"unit_symbols": [], "candidates": [], "instances": []}
    unit = {"id": "u-tr-x-l1", "type": "transcript", "inputs": [],
            "candidates": [], "nodes": [], "est_tokens_in": 0,
            "est_tokens_out": 0}
    text = render_input(unit, skeleton, {})
    assert text.index("Expression card") < text.index("Shape card")
    assert text.index("Shape card") < text.index("Style card")
    assert "medium=paper: holder*، kept_at*" in text


def test_the_card_lists_the_run_s_declared_unit_symbols():
    """Problem 4 — the first run wrote «پرس» and «نفر» as units, symbols the
    units record never declared, and every entry carrying one was refused. The
    card shows the run's own list, so a unit can read what it may write."""
    from facts_plan.build import shape_section
    text = shape_section(["g", "kg", "pcs"])
    assert "## واحدهای مجاز" in text
    for symbol in ("`g`", "`kg`", "`pcs`"):
        assert symbol in text, symbol
    assert text.index("`g`") < text.index("`kg`") < text.index("`pcs`")
    # …and says what the list actually forbids. A run that has to EXTEND the
    # units record writes the new symbol and its row in one document, and the
    # gate accepts exactly that (`_contract_problems` adds the document's own
    # rows to the list); a card that read «نماد دیگری پذیرفته نمی‌شود» sent a
    # unit looking for a symbol it was allowed to mint.
    assert "نماد دیگری پذیرفته نمی‌شود" not in text
    assert "همین سند" in text and "رکورد واحدها" in text
    # The record is named by the key the gate matches (`UNITS_KEY`), never by
    # its Persian title — a unit that wrote `key: "واحدها"` would be refused.
    assert "(کلید `units`)" in text and "(`واحدها`)" not in text
    empty = shape_section()
    assert "## واحدهای مجاز" in empty and "`pcs`" not in empty
    assert "رکورد واحدها" in empty and "سطر" in empty


def test_the_card_says_which_cells_carry_an_item_key():
    """Problem 6 — a column of ingredient *names* was typed `refItems`, which
    asks the gate to resolve every cell as an item; the schema shows the shape
    of `refItems` and of `per` but not what belongs in them."""
    from facts_plan.build import shape_section
    text = shape_section()
    assert ("ستونی که خانه‌هایش نام هستند `type: string` است؛ `refItems` فقط "
            "برای خانه‌هایی است که کد `##` فهرست اقلام یا کلید یک قلم را "
            "دارند." in text)
    assert "`per` در خروجی یک قاعده کلید یک قلم است، نه یک نام." in text
    # The three rule bodies `content._check_constant_shape` admits — the unit
    # that oscillated between «constant output carries no value or range» and
    # «a rule with inputs carries no expr or original» on 2026-09-08 had been
    # shown the enums and nothing about which members go together.
    assert "سه شکل قاعده پذیرفته می‌شود" in text
    assert "`lang: text`" in text and "`original`" in text \
        and "`value` یا `range`" in text
