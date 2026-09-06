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
