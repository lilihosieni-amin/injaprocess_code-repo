import pytest
from inja_ui_backend.phone import USERNAME_RE, normalise_phone, to_latin_digits


def test_folds_persian_digits():
    assert to_latin_digits("۰۹۱۲۳۴۵۶۷۸۹") == "09123456789"


def test_folds_arabic_indic_digits():
    assert to_latin_digits("٠٩١٢٣٤٥٦٧٨٩") == "09123456789"


def test_leaves_other_text_alone():
    assert to_latin_digits("cashier-013") == "cashier-013"


@pytest.mark.parametrize("raw", [
    "09123456789",
    "0912 345 6789",
    "0912-345-6789",
    "(0912) 3456789",
    "+989123456789",
    "00989123456789",
    "989123456789",
    "+۹۸۹۱۲۳۴۵۶۷۸۹",
    # The shape a non-technical user actually types when told to add a country
    # code: they prepend it to the number they already know, zero and all.
    "+98 0912 345 6789",
    "0098 0912 345 6789",
    "98 0912 345 6789",
    "+۹۸۰۹۱۲۳۴۵۶۷۸۹",
])
def test_every_spelling_lands_on_one_canonical_form(raw):
    assert normalise_phone(raw) == "09123456789"


def test_does_not_mistake_a_subscriber_98_for_a_country_code():
    assert normalise_phone("09891234567") == "09891234567"


def test_empty_input_stays_empty():
    assert normalise_phone("") == ""
    assert normalise_phone("   ") == ""


def test_username_regex_accepts_only_the_canonical_form():
    assert USERNAME_RE.fullmatch("09123456789")
    assert not USERNAME_RE.fullmatch("9123456789")     # missing leading zero
    assert not USERNAME_RE.fullmatch("091234567890")   # too long
    assert not USERNAME_RE.fullmatch("08123456789")    # not a mobile prefix
    # The pattern anchors both ends itself, so a caller reaching for .match()
    # or .search() instead of .fullmatch() cannot accidentally admit a longer
    # string on either side.
    assert not USERNAME_RE.match("091234567890")
    assert not USERNAME_RE.search("x09123456789")


@pytest.mark.parametrize("raw", [
    "09123456789",
    "+98 0912 345 6789",
    "+۹۸۰۹۱۲۳۴۵۶۷۸۹",
    "0912-345-6789",
])
def test_normalising_a_real_number_yields_a_valid_username(raw):
    # Binds the two exports together: whatever the normaliser emits for a real
    # number has to be something USERNAME_RE will accept, or every login fails.
    assert USERNAME_RE.fullmatch(normalise_phone(raw))
