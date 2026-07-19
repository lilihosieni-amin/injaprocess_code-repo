# Consolidate — Combination Detection & Post-Combination Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the `consolidate` agent to (A) detect the *combination point* between two genuinely-related processes and propose the logically-correct shape (flat merge for shared-start/prefix; attach for decomposition), and (B) guarantee the combined result has no duplicate nodes across a mother and its subprocess (or within a flat flow).

**Architecture:** Prompt-only edits to `data-repo/.claude/agents/consolidate.md`. Part A generalises the review-mode detection rule; Part B strengthens the apply-mode mother-assembly and the §4.7 soundness pass, reusing the no-duplicate doctrine already in `idef-extraction/SKILL.md` (§2, §7). No schema/engine/test change.

**Tech Stack:** Markdown prompt file (`data-repo/.claude/agents/consolidate.md`); the `idef-extraction/SKILL.md` dedup rules it cross-references.

## Global Constraints

- **Repo:** the edit is in **`data-repo`**, currently on branch `main` (confirm branch strategy with the user before committing — a feature branch is fine).
- **Prompt-only:** no schema/engine/CLI/test change. Do NOT touch `classify`, `extract`, `idef-extraction`, `process-voice`, `merge`, or any schema. Only `consolidate.md`.
- **Preserve the silence/precision bias (reviewer spec §5):** the new detection must NOT make the agent propose more aggressively. Combine only when genuinely related AND logically sound; unrelated similarity and node-recurrence-across-unrelated-processes still yield **no** suggestion; an empty `suggestions: []` remains a correct, successful outcome.
- **Preserve the allowed exception:** the mother container node vs. the child's first node are at different abstraction levels — not a duplicate (do not collapse them).
- **INV-3 guardrail:** collapse only accidental duplicate copies; a step genuinely performed at two distinct points, or a loop-back re-check, is kept.
- **INV-1 / INV-4 / INV-5:** unchanged — temp keys only in candidates; tombstone not delete; per-item overwrite authorization stands.
- **Shared checkout:** the data-repo working tree is shared with a concurrent human session and is read live by the running test bot — commit ONLY `consolidate.md`; touch nothing under `departments/**`.
- **Spec:** `docs/superpowers/specs/2026-07-19-consolidate-combination-and-dedup-design.md` is the source of truth.

---

## File Structure

| File | Change |
|---|---|
| `data-repo/.claude/agents/consolidate.md` | review-mode step 3 → generalised "find the combination point" (Part A); review-mode step 5 attach bullet → decomposition cue (Part A); apply-mode `mother_subprocess` bullet → cross-member dedup (Part B); soundness pass → post-combination dedup block citing idef §7/§2 (Part B) |

---

## Task 1: Combination detection + post-combination dedup in consolidate.md

**Files:**
- Modify: `data-repo/.claude/agents/consolidate.md` (review-mode ~lines 65–87; apply-mode ~lines 130–157)

**Interfaces:** none (prompt text). Part B cross-references `idef-extraction/SKILL.md` §7 "No duplication across a process and its subprocess" and §2 "One node per task" (already present, commit `2c6e168`).

- [ ] **Step 1: Read the file and confirm anchors**

Read `data-repo/.claude/agents/consolidate.md`. Confirm: review-mode step **3** "The over-cut signal" (a 4-line block), step **5** "Two suggestion kinds only" (the `merge` and `attach` bullets), apply-mode `merge` step **5** "Shape:" (the `flat` and `mother_subprocess` sub-bullets), and the "Soundness pass (spec §4.7)" section with its four seam bullets ending before "Emit **one `delta.schema.json` object per affected process**".

- [ ] **Step 2: Part A — generalise the detection rule (review-mode step 3)**

Replace this exact block:

```markdown
3. **The over-cut signal (spec §1, §5).** A node recurring across **closely related**
   processes is a signal they were over-cut → propose a consolidation. A node recurring
   across **unrelated** processes is legitimate (the same generic step really does happen
   in two different procedures) → **do not** suggest anything.
```

with:

```markdown
3. **Find the combination point (spec §3.1).** For each pair of **genuinely-related**
   processes, look for the *connection point* that would make them one, then propose the
   logically-correct shape:
   - **Flat merge — same or continuous work.** Signals: the two share a **start event** (a
     near-identical first node), or one process is a short **prefix** whose steps reappear
     at the head of the other, or they share several nodes end-to-end. Example: a 3-node
     «ورود پرسنل / ثبت اثر انگشت» stub whose steps are the opening of the next process →
     merge them flat.
   - **Attach — decomposition.** A **whole** process X is the detailed decomposition of a
     **single activity node N** in another process Y — N's label *names or abstracts* X's
     procedure and X reads as N's steps. This needs **no** node duplication. → propose
     `attach` X under Y's node N. Example: a node «سپردن مدیریت نوبت به هدویتر» in one
     process whose full procedure is a separate «مدیریت نوبت» process → attach the latter
     under that node.
   **Relatedness + logic gate.** Combine ONLY when the two are genuinely related AND the
   combination is logically sound — a real shared boundary or a real decomposition. A node
   recurring across **unrelated** processes is legitimate (the same generic step in two
   different procedures) → **do not** suggest anything. Superficial similarity is never a
   combination. This does not relax the silence rule below.
```

- [ ] **Step 3: Part A — tie the attach kind to the decomposition cue (review-mode step 5)**

Replace this exact block:

```markdown
   - **`attach`** — one process is really a subprocess of a node in another. Set `child`
     (the process to nest), `parent_process`, and `parent_node` (the real node id it hangs
     under). Cite the evidence the same way.
```

with:

```markdown
   - **`attach`** — one process is really the decomposition of a single node in another
     (the "attach — decomposition" signal in step 3). Set `child` (the process to nest),
     `parent_process`, and `parent_node` — the real node id whose label names/abstracts the
     child's procedure. Cite the evidence: the elaborated node's id + label, and the child
     process id whose steps decompose it.
```

- [ ] **Step 4: Part B — cross-member dedup when building a mother (apply-mode `mother_subprocess`)**

Replace this exact block:

```markdown
   - **`chosen_shape == "mother_subprocess"`** → the heir is the **mother**. Its activity
     nodes are the high-level steps. For **each member that becomes a child**, add a
     `subprocess_links` entry `{parent_key: "<heir temp key>", child: "<member id>"}` and
     **DO NOT inline that member's detail** — it stays the child process, re-parented by the
     engine, and is **kept out of `supersedes`**. Only members whose steps you genuinely
     inline into a mother node go in `supersedes`; if every member becomes a subprocess
     child, `supersedes` is empty (`[]`).
```

with:

```markdown
   - **`chosen_shape == "mother_subprocess"`** → the heir is the **mother**. Its activity
     nodes are the high-level steps. For **each member that becomes a child**, add a
     `subprocess_links` entry `{parent_key: "<heir temp key>", child: "<member id>"}` and
     **DO NOT inline that member's detail** — it stays the child process, re-parented by the
     engine, and is **kept out of `supersedes`**. Only members whose steps you genuinely
     inline into a mother node go in `supersedes`; if every member becomes a subprocess
     child, `supersedes` is empty (`[]`).
     **Cross-member dedup (spec §3.2) — the mother must not repeat a child's steps.** When
     one member is inlined as the mother-frame and another becomes a child, any step of the
     inlined member that **also lives in the child** belongs to the child **only** — do NOT
     put it in the mother. The mother's link to a child is a **single container node**, not
     a re-modelling of the child's internal steps or decision. (Two members are flagged for
     merge precisely because they share steps; those shared steps live once, in the child.)
     Result: each real task appears in exactly one place across mother + child — the only
     allowed level-crossing pair is the container node vs. the child's first node, which are
     at different abstraction levels and expected to differ.
```

- [ ] **Step 5: Part B — post-combination dedup in the soundness pass**

In the "Soundness pass (spec §4.7)" section, immediately AFTER the four seam bullets (the block ending with the `mother+subprocess:` bullet "...apply the entry/exit check to **every** mother node that links to a child.") and BEFORE the line "Emit **one `delta.schema.json` object per affected process**...", insert this block:

```markdown
**Post-combination dedup (spec §3.2) — REQUIRED, run with the seam checks.** Re-read the
result and enforce the same no-duplicate doctrine as `idef-extraction/SKILL.md` (§7 "No
duplication across a process and its subprocess" + §2 "One node per task"):

- **mother + subprocess:** no mother node may duplicate a node inside its child. A mother
  built per the apply-mode rule already avoids this; if you still find a mother node
  repeating a child step, remove it from the **mother** (`flag_removed` + `remove_edges`,
  then `add_edges` to rewire the flow past it), so the step lives only in the child. Confirm
  the child is entered from the mother's single container node and is not re-doing the
  mother's high-level steps. The container-node-vs-child-first-node pair is the one allowed
  exception.
- **flat:** confirm no two heir nodes describe the same task; if a duplicate slipped
  through, collapse it (`flag_removed` + rewire) — a revisit must be a loop-back edge, not a
  second node.
- **Guardrail (INV-3):** collapse only accidental duplicate copies; a step genuinely
  performed at two distinct points, or a loop-back re-check, is **kept**.

Fold these dedup edits into the same per-process `delta` objects described next.
```

- [ ] **Step 6: Grep-verify all four edits are present**

Run:
```bash
cd "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
grep -n "Find the combination point" .claude/agents/consolidate.md          # Part A step 3
grep -n "Attach — decomposition" .claude/agents/consolidate.md               # Part A relationship
grep -n "names/abstracts the" .claude/agents/consolidate.md                  # Part A step 5 attach
grep -n "Cross-member dedup" .claude/agents/consolidate.md                   # Part B mother
grep -n "Post-combination dedup" .claude/agents/consolidate.md               # Part B soundness
grep -n "No duplication across a process and its subprocess" .claude/agents/consolidate.md  # cite to idef
```
Expected: each of the six greps prints exactly one line (the last one is the cross-reference to the idef doctrine).

- [ ] **Step 7: Consistency re-read (no contradiction, no silence-erosion)**

Read the edited regions once more and confirm:
- Part A keeps the silence/precision bias intact — the relatedness/logic gate and "superficial similarity is never a combination" are present, and step 4 (THE SILENCE RULE) is unchanged.
- Part A's two relationships (flat prefix/shared-start; attach decomposition) do not overlap or contradict the `merge`/`attach` output shapes in step 5.
- Part B does not contradict the container-node exception or INV-3, and the `flag_removed`/`remove_edges`/`add_edges` ops it names match the delta rules already in the soundness section (id-vs-key discipline unchanged).
Note the confirmation in the commit body; no command to run.

- [ ] **Step 8: Commit (only consolidate.md)**

```bash
cd "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
git add .claude/agents/consolidate.md
git commit -m "feat(consolidate): detect combination point + dedup combined result

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Confirm with `git show --stat HEAD` that only `.claude/agents/consolidate.md` changed and nothing under `departments/**` was staged.

---

## Acceptance (scenario re-run — judgment gate, after Task 1)

Prompt-only, so the real proof is behavioural. Re-run the `dining` review (either in the test bot with a fresh `/process-voice dining-1405-04-11`, or by dispatching the `consolidate` agent in review mode against a `b5ab354`-style worktree). Confirm:

1. It proposes **`001` + `002` as a flat merge**, citing the shared start event «ورود پرسنل و ثبت اثر انگشت».
2. It proposes **`007` as an attach** under `dining-005-n009` («سپردن مدیریت نوبت به هدویتر»).
3. Applying the `010`/`011` `mother_subprocess` merge yields a `021` whose nodes do **not** duplicate child `010`'s steps (the decision/refund steps live in one place; the mother links to the child via a single container node).
4. On an already-clean department it still returns `suggestions: []` (silence preserved).

If any check fails, iterate on the corresponding rule in `consolidate.md` and re-run.

---

## Self-Review (completed by plan author)

- **Spec coverage:** §3.1 Part A (flat + attach relationships + relatedness gate) → Steps 2–3; §3.2 Part B (mother/child dedup + flat collapse + idef cross-ref + INV-3 guardrail) → Steps 4–5; §4 files-touched (only `consolidate.md`) → Task 1; §5 verification (grep + consistency + scenario) → Steps 6–7 + Acceptance. All covered.
- **Placeholder scan:** none — every edit is verbatim old→new text; commands are exact.
- **Type consistency:** N/A (prompt text). Cross-references are consistent: the idef doctrine heading "No duplication across a process and its subprocess" is cited verbatim; the delta ops named (`flag_removed`, `remove_edges`, `add_edges`, `revise_nodes`) match those already documented in the soundness section.
