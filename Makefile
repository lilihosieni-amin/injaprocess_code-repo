VENV  := .venv
BIN   := $(VENV)/bin
STAMP := $(VENV)/.installed

$(STAMP): requirements-dev.txt
	test -d $(VENV) || uv venv -q $(VENV)
	uv pip install -q --python $(VENV)/bin/python -r requirements-dev.txt
	touch $(STAMP)

.PHONY: test
test: $(STAMP)
	$(BIN)/pytest -q

.PHONY: lint
lint: $(STAMP)
	$(BIN)/ruff check .

.PHONY: clean
clean:
	rm -rf $(VENV) .pytest_cache .ruff_cache
