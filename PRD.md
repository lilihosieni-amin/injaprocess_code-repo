# PRD — Restaurant Process Documentation System (inja food)

| | |
|---|---|
| **Version** | 0.4 (draft, no technical detail) |
| **Date** | 2026-07-28 |
| **Status** | Live; amended after the department export shipped |
| **Product owner** | Dev team (single person) |
| **End user** | Process analyst (non-technical) |
| **Companion document** | ARD (architecture & technical design) — follows this document |

> This document defines only the "what and why." All the "where and how" (paths, names, data structures, tools, deployment) lives in the ARD.

---

## 1. Summary

The inja food restaurant is made up of several departments, and each department's work processes today exist only in staff members' heads and in in-person interviews. The goal of this system is to turn those interviews (audio) and their accompanying documents into a set of **structured, machine-readable processes** based on the **IDEF0 / IDEF3** standards, viewable and editable interactively.

The user — who has no technical background — must be able to upload voice notes and files, start processing, and view and correct the output, all without touching the server. The whole system is single-user and runs on a server.

---

## 2. Problem & Goal

**Problem.** The restaurant's process knowledge is scattered, verbal, and undocumented. Documenting it by hand with the IDEF standards is slow and requires expertise, and the primary user has neither the technical skills to work with a server nor a suitable tool.

**Goal.** A tool that turns audio interviews and documents into structured IDEF0/IDEF3 processes, with minimal friction for a non-technical user, in a reliable way that preserves change history, and with an interactive, editable output.

---

## 3. Users & Context

- **Primary user (process analyst):** conducts in-person interviews with department staff, records voice notes, and collects related documents. Non-technical; interacts only through Telegram and the UI.
- **Developer user:** the developer, who builds the system and gradually improves the extraction logic.
- **Context:** single-user, runs on a server, with full change history preserved. No need to "keep the user's device on," since everything is server-side.
- **Current departments (9):** management, accounting, warehouse, procurement, cooking, preparation, dining, cashier, logistics. The system must be **extensible** so that new departments (e.g. QC) can be added easily in the future.

---

## 4. Goals & Non-Goals

**Goals (v1):**
- Structured intake of voice notes and documents via Telegram.
- Processing voice into IDEF0/IDEF3 processes, which the user starts and steers via Telegram.
- An interactive UI for viewing/editing processes and sub-processes (developed alongside the rest).
- Full history of the output preserved.
- **A shareable department document** the analyst can hand to staff who will never open the editor (§7.7).

**Non-Goals (v1):**
- Multi-user support or role management. Authentication stays deliberately small: one analyst credential for the editor, and — since the export shipped — **one shared credential for the exported documents** (NFR-11). Neither is a user system, and there is no per-person account, attribution, or role anywhere.
- Automatic KPI generation or statistical analysis over processes.
- Support for other languages/restaurants.

> **Reversed in v0.4.** Through v0.3 this section read *"PDF/Word output — the final output is intentionally interactive, not a static document."* That was rejecting a **replacement** for the interactive product, and it still is. What shipped is different in kind: a **derived, read-only document generated from the same data**, for the audience that will never log in (kitchen staff on a phone). The interactive UI remains the product and the only place anything is edited; an export is a build artifact that can be regenerated or thrown away at any time (INV-6). Word output remains out of scope.

---

## 5. v1 Scope

**In scope:** upload bot, control bot, process-extraction pipeline, the process/department content model, the interactive UI, and the department export — all five together.

**Out of scope:** anything under "Non-Goals"; and cost optimization (for now the strongest model is used for everything on purpose — see NFR).

---

## 6. System Overview

The system consists of six components that communicate **only through the shared data on the server**. Each one's role:

1. **Upload bot:** raw intake of voice/documents from the user and storing them on the server. No processing.
2. **Control bot:** the user starts processing and manages sessions via Telegram, with no technical work on the server.
3. **Extraction processing:** turns the voice into IDEF0/IDEF3 processes.
4. **Central data:** the system's source of truth; the output of every stage lives here and its history is preserved.
5. **Interactive UI:** viewing and editing processes, independent of the bots.
6. **Department export:** on request, produces a self-contained document of a department's processes for staff who never open the editor. It only ever *reads* the central data; its output is a build artifact kept **outside** the central data, and it is the one part of the system with an audience beyond the analyst (§7.7).

---

## 7. Functional Requirements (FR)

### 7.1 Upload Bot

- **FR-U1:** The user first chooses the upload type: voice or file.
- **FR-U2 (file path):** The user first selects one department (from the valid departments); this department applies to the **entire batch**. Then any number of files sent one after another belong to that same department (each file does not get a separate department). On "done," the bot shows the list of files with the single destination department, and on the user's confirmation stores them all. To upload to a different department, the user starts a new round.
- **FR-U3 (voice path):** The user first enters the meeting date, then selects the departments the voice is about (multiple allowed), then sends the voice, and the system stores it.
- **FR-U4 (deterministic naming):** The voice file's name is generated deterministically by the system (not by the language model), such that it is unique, non-colliding, and reflects the selected department(s) and the meeting date.
- **FR-U5:** After a successful upload, the bot gives the user a short, **copyable** identifier to paste into the control bot to start processing.
- **FR-U6:** The selected department must always be one of the system's valid departments.
- **FR-U7:** The file is held temporarily until the user's confirmation, and is only finalized after final confirmation.
- **FR-U8:** Any file/voice intake is only possible through this bot.

### 7.2 Control Bot

- **FR-C1:** The user pastes the voice identifier and asks to start processing.
- **FR-C2:** The user can create a new session and manage processing sessions.
- **FR-C3:** Any clarifying question from the system is raised conversationally in Telegram so the user can see and answer it.

### 7.3 Extraction Processing

- **FR-P1 (locate file):** As a first step, the system locates the voice matching the identifier; if there is no exact match, it asks conversationally and shows the closest options.
- **FR-P2 (transcription):** The system extracts and stores the voice's text. If the text of that same voice already exists, it does not redo the work.
- **FR-P0 (set as the unit of work):** The unit of processing is a **set of recordings read together**, not a single recording. A run is pointed either at a **department** (process all its recordings) or at an **explicit list of recordings**, and the system reads them **all, together**, before identifying any process — because a single recording never contains a complete process, and later meetings routinely rework earlier ones. A set of one is simply the smallest case of the same behaviour.
- **FR-P3 (process identification):** Reading the whole set together, the system identifies and separates the processes it discusses. Each process is **assembled from every recording that mentions it**, with later sessions superseding earlier ones where they rework the same material. For each identified process the system detects its state: a new process, an update to an existing (already-committed) process, or **unchanged** (a process already extracted and about which the set says nothing new) — plus, where the evidence warrants it, the restructuring outcomes of FR-M1.
- **FR-P4 (two human approval gates):** Processing passes through two human gates, both before anything is written. **First**, before the set is read, the user **confirms the set of recordings** to be processed — they may have left one out or included an extra — and the system discloses what an explicit list leaves out. **Then**, after the system has read the set and proposed the process set (including its new/update status and any merge, split, or attach; see FR-M1), the user confirms or corrects it (e.g. a process was missed, or two should be merged). On a correction, only this identification is redone, and no output has been touched yet.
- **FR-P5 (process creation):** After confirmation, the system builds the IDEF0/IDEF3 structure for each process, or updates the existing process.
- **FR-P6 (department overview file):** At the end of each processing run, the department's overview file (including its sub-units, personnel, and their duties) is created or updated.
- **FR-P7 (history preservation):** Every successful processing run is recorded such that the change history and the reference to the voice and affected departments are preserved.
- **FR-P8 (one department per run):** A run commits the output of a **single department**. Where a recording touches material belonging to another department, that material is still attributed to its true department and is picked up when that department's own set is processed.
- **FR-P9 (run retention):** The intermediate outputs of each run are kept permanently, to be used later for improving extraction quality.
- **FR-P10 (direct edits by chat):** The user can edit already-committed work by a **chat instruction alone, with no voice** — for example "change node X's label in process Y", including **structural edits** (merge, split, attach, retire). The change goes through the same path as any other edit and is recorded in the history like any other change.

### 7.4 Process Content Model

- **FR-D1 (readable, deterministic ID):** Every process and every part of it has a readable, unique identifier that is always generated by the system (not by the language model).
- **FR-D2 (unified ID generation):** IDs are always taken from a single source, regardless of whether the process was created via voice processing, via chat, or manually in the UI. An id, once used, is **never reused** — even after a process is permanently deleted (see INV-4).
- **FR-D3 (process content):** Each process contains: an overall summary; process-level IDEF0 information (input, control, output, mechanism); key performance indicators (KPIs); and the process body as activity boxes, connections, and split/join junctions (AND/OR/XOR).
- **FR-D4 (per-box information):** Each box has a short title, a longer description (seen on click), the performer of the activity, and IDEF0 information where available.
- **FR-D5 (no fabrication):** Process and box information is filled only from the actual content of the voice; complete filling is not mandatory, and the system must not fabricate information to complete the template.
- **FR-D6 (sub-process):** A box can expand into a sub-process; the sub-process is itself a full process with a bidirectional link to its parent. The parent box's information boundary is kept in sync with its sub-process.
- **FR-D7 (sub-process creation):** Automatic, but only when a group of steps forms a **self-contained, separately-nameable procedure** — a distinct thing in its own right that one would give its own name — **not** because a number of sub-steps was crossed. Step count is never the reason to nest; a group of steps that is not a nameable procedure stays as flat sibling steps. Automatically created sub-processes are flagged and reported to the user at the approval stage (without halting processing).
- **FR-D8 (deletion):** There is no automatic deletion. Seemingly removed items are only flagged. Deleting a parent box **orphans** the sub-process (not a cascade delete) and the user is warned.
- **FR-D9 (flowchart layout):** The positions of flowchart parts are saved so the user's edits are preserved. The initial layout is horizontal and left-to-right, and for long flows it wraps **serpentine-style** across multiple rows so it does not overflow the page width.
- **FR-D10 (layout during updates):** The user's manual repositioning is preserved. Adding a new part at the end of the process is only an append; inserting a part in the middle triggers a **local** re-layout (from the insertion point onward) that preserves the upstream part, and this re-layout is reported to the user. The UI also offers a full "re-layout" option.
- **FR-D11 (source tracking):** For each part it is recorded which voice/run it came from and which ones changed it.
- **FR-D12 (process order):** Each department has an explicit order over its processes, decided by a human. This order is what the UI list shows and what the department export follows. It is maintained by the system, never by the language model: a newly created process is added to the end of the order, a retired (tombstoned) process leaves it, and the user can rearrange it at any time in the UI. Placement has refinements that preserve the human's curation — a process that replaces earlier ones inherits their position instead of being appended, and a sub-process that the system discovers while updating its parent is placed directly after that parent (a sub-process the user creates by hand in the UI is appended like any other, because the user is making one and can drag it where they want it) — and the ARD (§4.6) is authoritative on the exact placement rules.

### 7.5 Update & Conflict

- **FR-M1 (process states):** The system proposes a state for each process, and the human makes the final decision. Besides **new**, **update**, and **unchanged**, the proposal may be a restructuring of the existing baseline — **merging** two processes into one or **splitting** one into two (see FR-M5). An "unchanged" process is neither created nor edited and is only reported as "already covered" (with a lightweight record that this set also referenced it); if the user is unsure, they can convert it to "update" right there. (The main mechanism for preventing duplicate processes and unnecessary work.)
- **FR-M2 (preserving existing output):** When updating an existing process, the IDs and layout of existing parts are preserved and only the necessary changes are applied.
- **FR-M3 (conflict policy):** Empty fields and new items are filled automatically; but wherever the voice would change a value that is **already filled** (perhaps the user's manual edit), instead of overwriting, that change is recorded as a "pending proposal" and the original value is left untouched.
- **FR-M4 (conflict review):** Conflicts are not asked about mid-processing (processing is not blocked). At the end of each work cycle, the system shows the user the **list of conflicts** (not just their count) in Telegram so they are informed, and the user can resolve them right there in chat if they wish. Independently, all conflicts also remain available in the **UI review inbox** — showing "current value vs. proposal" with accept/reject — to be handled there whenever the user wants. In both paths, the original value stays untouched until the user decides.
- **FR-M5 (restructuring the baseline):** A baseline produced by an earlier run is **correctable, not merely extendable**. Because every run re-reads the whole set of recordings, the system can restructure existing processes, not only create and update them: **merge** two over-fragmented processes into one, **split** one that is really two, **attach** an existing process as another's sub-process, and **remove (retire)** a spurious process. A retired process is **tombstoned** — never automatically deleted — and remains on record, marked as retired and pointing to whatever replaced it; the user may later **permanently delete** it, after which its id is never reused (see INV-4, FR-D2).

### 7.6 UI

- **FR-I1:** The UI is independent of the bots and works from the same central system data.
- **FR-I2 (navigation):** Clicking a department name → the list of its processes; clicking a process → its flowchart; clicking a sub-process → the sub-process flowchart; clicking a box → its further details; and a process summary card (overall info and KPIs) before entering the boxes.
- **FR-I3 (view & edit):** The UI's default mode is **view-only**; the user sees processes and flowcharts without anything being accidentally changeable. Only by pressing the **"Edit"** button does the editor open and the user can edit/delete/add and reposition parts. Changes are written only when the user presses **"Save"** (not automatically on every change).
- **FR-I4 (review inbox):** Conflicts are shown with a diff and accept/reject buttons, and the user's decision is saved.
- **FR-I5 (manual creation):** The user can manually create a new process for a department; the system assigns an ID and the process is built with the standard structure from the start.
- **FR-I6 (retired processes):** Retired (tombstoned) processes are still **shown** in the UI, clearly labelled as retired and **view-only** (they cannot be edited), with links to the process or processes that **replaced** them. From here the user can trigger a **permanent delete** of a retired process (the one allowed manual deletion; see INV-4).
- **FR-I7 (reordering processes):** The user can rearrange a department's process order in the UI through a dedicated reorder view, and the change is saved only when they confirm it — like every other edit (see FR-I3). Retired processes take no part in the order and are shown after the ordered ones.
- **FR-I8 (requesting an export):** The user requests either export for a department from the UI. From the click until the link is handed back, a **loading state is shown**, so a run that takes tens of seconds never looks like a frozen screen. The link is then displayed ready to copy, together with a statement of what the recipient will need in order to open it (FR-E7).

### 7.7 Department Export

The audience here is **not the analyst**. It is the department's own staff — a cook, a cashier, a waiter — reading on a phone, who have no account and will never open the editor.

- **FR-E1 (two kinds):** A department can be exported in two forms: a **flowchart document** (the official record: each process's diagram, in the department's curated order) and a **step-by-step guide** (the same processes rewritten as ordered steps for someone doing the job). They are separate documents, requested separately.
- **FR-E2 (fidelity):** The flowchart in the export must be **the same flowchart the system shows on screen** — not a redrawing that can drift from it. What the analyst approves in the UI is what the staff member reads.
- **FR-E3 (self-contained):** An export is a **single file that opens on its own** — no server, no network, no installation. Downloaded, emailed, or opened from a phone's storage months later, it still works. It carries no live link back to the system.
- **FR-E4 (permanent link, no history):** Each department+kind has **one document at one permanent link**. Re-exporting replaces it in place; the link never changes and there is no archive of past exports. An export is a snapshot of the data at the moment it was made, and the way to refresh it is to make it again.
- **FR-E5 (printable):** Each export can be turned into a **PDF suitable for printing and posting on a wall**, with no diagram, label, or step ever cut in half across a page boundary. Producing the PDF must work on a phone, not only on a laptop.
- **FR-E6 (read-only and clean):** An export carries no editing affordances and no half-finished internal state — no edit/undo/layout/save controls, and no pending-conflict markers. Retired processes are excluded. A reader sees the settled picture.
- **FR-E7 (access):** The exported documents are **behind a login**. There is **one shared username and password for the whole export system**, given to staff; it opens the documents and **nothing else** — in particular it can never reach the editor, the processes, or any other part of the system. The analyst's own login also opens the documents, so they never need the shared password to check their own work. If the shared credential has not been configured, the documents are **closed**, never open.
- **FR-E8 (the login the staff member sees):** Someone following an export link who is not signed in is shown a **small Persian sign-in page for the exports** — not the analyst's application — and is returned to the document they were trying to open once they sign in.
- **FR-E9 (a forwarded file is not recoverable):** The login protects the *link*. A copy of the file that someone has already downloaded opens forever, offline, with no server involved. This is inherent to FR-E3 and is stated so it is never mistaken for something the password prevents.

---

## 8. User Flows

**Main flow (extraction):** The user records the meetings ← in the upload bot enters the date and departments and sends the voices ← in the control bot points a run at a department (or an explicit list of recordings) and says "process" ← the system shows the **set of recordings** it is about to read and the user confirms it (Gate A) ← the system reads them all together, identifies the processes, and shows the proposed process set — including any merge, split, attach, or retire — for approval (Gate B) ← the user confirms/corrects ← the system builds and reconciles the processes and the changes are recorded ← the user opens the department in the UI, views the flowcharts, edits as needed, and resolves conflicts.

**Secondary flow (manual creation & direct edits):** The user creates a new process for a department in the UI (or via chat); the system assigns an ID; the next recording that touches that same process is linked to this existing process. The user can also edit committed work — including structural changes — by a chat instruction alone, with the change recorded in the history.

---

## 9. Non-Functional Requirements (NFR)

- **NFR-1 (Telegram access):** Only registered Telegram IDs (for now, only the primary user) are allowed to use either bot; others are silently rejected.
- **NFR-2 (large audio files):** The system must be able to receive and process large meeting audio files (which are usually large) without issue.
- **NFR-3 (UI auth without a database):** UI login is protected by a username and password, with no database required. The password is stored securely, not in plaintext.
- **NFR-4 (model):** All processing uses the strongest model (Opus 4.8), even for simple tasks. This is a quality-driven choice and can be changed later.
- **NFR-5 (time & budget):** The time and cost budget for processing must be set to match the multi-stage, high-cost nature of each run.
- **NFR-6 (robustness on large voices):** Processing must not fail due to the model's memory limits on long voices; the system must handle large voices without data loss.
- **NFR-7 (history & backup):** All changes — from any path (voice processing, chat, or UI) — are recorded in the history, and no change goes unrecorded. In addition, an off-site backup is taken **twice a day** (11am and 11pm, only if there is a new change).
- **NFR-8 (extensibility):** Adding a new department must be simple and must not change the system's logic.
- **NFR-9 (service durability):** The bots must run as permanent, durable services on the server.
- **NFR-10 (output integrity):** Every structured output the system produces conforms to the system's fixed data contract; a nonconforming output is detected and corrected before anything relies on it.
- **NFR-11 (export access is separate by construction):** The shared export credential and the analyst credential are **separate mechanisms**, not the same mechanism with different permissions. It must not be possible for the export credential to reach the editor even if someone later forgets to write a check — the separation has to hold structurally. A missing or half-configured export credential closes the documents rather than opening them.
- **NFR-12 (an export contains only what it shows):** An export carries the department's process content and nothing else — no internal bookkeeping, no unresolved proposals, no record of which recording something came from. Anyone who opens the file, now or in five years, sees exactly what the document displays.
- **NFR-13 (a failed export never costs the document):** Producing the printable form is an enhancement. If it fails, the export still succeeds and the document is still published; the failure is recorded for the operator rather than shown to the user as a broken export.

---

## 10. Product Invariants

Non-negotiable rules that must always hold:

- **INV-1:** No identifier is ever created by the language model; IDs are always generated by the system, uniquely, from a single source. An id, once used, is **never reused** — not even after the process it belonged to is permanently deleted. The same rule governs the **order** of a department's processes: it is written only by the system's own tools, never by the language model.
- **INV-2 (code/data separation):** At runtime, the extraction logic cannot change the application code or its own configuration; it only produces/edits data. Changing the logic is possible only at development time.
- **INV-3 (no fabrication):** Extraction information is filled only from the actual content of the voice.
- **INV-4 (no automatic deletion):** The system **never deletes automatically** — it only flags a process as retired and tombstones it, keeping it on record. The single allowed deletion is a **user-initiated permanent delete** of a process that is already retired (tombstoned); once deleted, its id is never reused.
- **INV-5 (human approval):** The list of processes is confirmed by a human before creation, and existing values are not changed without human approval.
- **INV-6 (an export is derived, never a source):** An exported document is a **read-only artifact built from the central data**. It is never edited, never read back in, and never becomes the record of anything. Deleting every export must cost the system nothing but the effort of regenerating them, and no part of the system may depend on one existing.

---

## 11. Acceptance Criteria

- **AC-1:** Uploading a large voice from Telegram succeeds and the file is stored on the server.
- **AC-2:** When processing is started from the control bot, the system reaches the approval stage, and after the user's confirmation, valid IDEF0/IDEF3 processes are produced and recorded.
- **AC-3:** Re-processing a department's recordings does not create rework or duplicate processes: because all the recordings are read together and reconciled against what is already committed, a process already covered is recognised as such rather than created again.
- **AC-4:** A run scoped to a department produces the correct output for that department; material belonging to another department is attributed to it and picked up by that department's own run.
- **AC-5:** Repositioning flowchart parts in the UI is preserved after reopening, and the next voice does not break the user's manual layout.
- **AC-6:** A value conflict is recorded as a "pending proposal" and is resolvable in the UI review inbox with accept/reject, without the original value being changed automatically.
- **AC-7:** At runtime, the extraction logic cannot change the code or its own configuration.
- **AC-8:** An unauthorized Telegram ID cannot use the bots, and the UI does not open without the correct username/password.
- **AC-9:** A wrong or over-fragmented baseline from an earlier run is **correctable by a later run**: two processes that should be one are merged, and one that is really two is split, rather than the mistake being locked in.
- **AC-10:** A retired process is **tombstoned** (not deleted), shown as retired with links to what replaced it, and can be **permanently deleted by the user**, after which its id is never reused.
- **AC-11:** After the user rearranges a department's processes in the UI, that order is what the list shows when reopened, it survives a later processing run, and a new top-level process created afterwards appears at the end of the order rather than in an arbitrary position; a sub-process or restructure heir is positioned per ARD §4.6.
- **AC-12:** Both exports of a department can be produced from the UI, each returns a permanent link, and re-exporting replaces the document at that same link. The flowchart in the export matches the one the UI shows for the same process.
- **AC-13:** An exported file opened with **no network at all** — double-clicked from a downloads folder — renders completely: diagrams, Persian text, and layout.
- **AC-14:** Following an export link without signing in shows the export sign-in page (not the analyst's application); the shared credential opens the document; the **same credential is refused by every part of the editor**; and the analyst's own session opens the document without the shared password. With no export credential configured, the document is refused rather than served.
- **AC-15:** The printable form of a flowchart export contains no diagram, node label, or step split across a page boundary, and can be produced from a phone.

---

## 12. Open Items & Future

- Adding new departments (QC, etc.) — the mechanism is ready, each department's content comes later.
- Cost optimization with cheaper models for lightweight stages (for now, all Opus 4.8 on purpose).
- Filling in KPIs (which are usually not stated in a process-description interview) via a separate question or manual entry.
- ~~Department process export~~ — **shipped** in v0.4 (§7.7). It follows the process order of FR-D12, which is why that order was recorded explicitly before the export existed.
- **Export follow-ups, deliberately not done.** Changing the shared export password does not sign out anyone already signed in (their session lasts out its normal life); making it immediate is possible but was judged not worth the added machinery. There is also no per-recipient link and no way to revoke one — a consequence of FR-E7's single shared credential and FR-E9's standalone file, and the point at which per-person accounts would become the honest answer.
- Word/Office output — still out of scope. The two exports plus print cover the need.

---

## 13. Deferred to the ARD

These technical topics are intentionally excluded from the PRD and appear in the ARD: folder structure and naming; the exact process data structure; the design of the processing and its technical components; how the ordering of stages is guaranteed; the separation of the code and data environments and how development is done; the layout algorithm; the authentication and access mechanism; and how the services are deployed on the server.
