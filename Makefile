VENV := .venv
BIN  := $(VENV)/bin

$(VENV): requirements-dev.txt
	uv venv -q $(VENV)
	uv pip install -q --python $(VENV)/bin/python -r requirements-dev.txt
	touch $(VENV)

.PHONY: test
test: $(VENV)
	$(BIN)/pytest -q

.PHONY: lint
lint: $(VENV)
	$(BIN)/ruff check .

.PHONY: clean
clean:
	rm -rf $(VENV) .pytest_cache .ruff_cache
