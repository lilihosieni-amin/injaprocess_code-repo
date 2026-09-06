# Expression card

An `expr` is FEEL, and FEEL here is a closed subset. Nothing else parses.

**Keywords** — the only bare words that need no declaration:
`if` `then` `else` `and` `or` `not` `min` `max` `sum` `abs` `round` `over` `of`

**Identifiers.** Every other bare word must be declared: the `key` of one of the
rule's own `inputs[]` or `outputs[]`, or the `key` of an entry named in
`calls[]`. An identifier declared nowhere fails validation. A parameter is an
ordinary input: `{"key": "tolerance_gr", "from": {"param": "tolerancePerFoodGr"}}`
declares `tolerance_gr`, and the expression reads it by that name.

**The one aggregate form.** `sum over <input key> of ( … )` — the input key
names a record, and the identifiers inside the parentheses are that record's
field keys. There is no other loop and no other aggregate.

**`key`, never `name`.** Every member of `inputs[]`, `outputs[]`, `fields[]`,
`rows[]`, `applies_to[]`, `instances[]` is addressed by `key`.

**Minted segments** match `^[a-z][a-z0-9]*(_[a-z0-9]+)*$` — lowercase ASCII
letters, digits, single underscores. `__` joins two segments into a key and is
never typed inside one. No Persian, no capital, no dash, and never a segment
transliterated from a Persian word you guessed at.

**Never call a library function.** `GET_ROW_BY_PERSIAN_DATE`, `FILTER_BY_DATE`,
`CONVERT_GR_TO_KG` and their kind are the sheet's plumbing. State the business
computation instead.

**Worked examples**

    masraf_elami = mojudi_avval_shab + daryaft_az_anbar - mojudi_akhar_shab
    enheraf = masraf_vaqei - masraf_elami
    enheraf_ba_tolerance = enheraf - tolerance_gr / 1000 * basis
    masraf_vaqei = sum over bom of (gram_per_portion * portions_sold)
