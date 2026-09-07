# Style card

**`title`** — a noun phrase naming the concept. At most 60 characters, Persian,
no file, tab or cell name, no Latin except an item code.

**`statement`** — one to three sentences in the register of a written
procedure: what is measured or computed, in what unit, by whom, when; for a
record, what it is and who fills it; for an item, what it is and how it is
counted.

Never, in either field:

- an A1 address (`H6`, `$J$15`, `'پیتزا'!M6:M15`), a column letter, a tab, file
  or `Table_*` name;
- formula text, a function name, `IMPORT_FROM_SHEET`, `LET(`, `LAMBDA`,
  `.xlsx`, `.gs`;
- a schema field name, or this pipeline's vocabulary: «پاس», «اسکلت»,
  «بخش از داده‌ها», «واحد کاری», «بچ», «original», «bindings», «FEEL»,
  «account», «expr»;
- a Latin token of four letters or more — `csv`, `Excel`, `sheet`, a unit
  symbol and an item code are the only exceptions;
- a quotation, «گفته شد», «گوینده»;
- the colloquial endings «می‌زنن», «می‌کنن», «داشته باشن», «بگیم», «می‌گیم»;
- a «…» span longer than eight words.

«ستون», «تب» and «سلول» are allowed in exactly two places: a record's own
`statement`, and a field's `description`.

**Worked pair**

before — «ستون J تب پیتزا (گروه J6:J15): انحراف برابر است با مصرف واقعی منهای
مصرف اعلامی.»

after — «انحراف مصرف هر مادهٔ اولیه در پایان شب برابر است با مصرف واقعی
(برآوردشده از فروش و نسخهٔ غذاها) منهای مصرف اعلامی لاین. مقدار منفی یعنی لاین
بیش از انتظار مصرف کرده است.»

A quote belongs in `source[].quote`, a locator in `source[]`, a rival reading in
`accounts[].statement` — never in a title or a statement.
