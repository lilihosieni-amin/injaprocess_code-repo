# PRD — Restaurant Process Documentation System (inja food)

| | |
|---|---|
| **Version** | 0.6 (draft, no technical detail) |
| **Date** | 2026-08-05 |
| **Status** | Live; amended for the multi-user architecture (§7.8–§7.11), access model revised in v0.6 |
| **Product owner** | Dev team (single person) |
| **End user** | Process analyst (editor) and the restaurant's staff, by role |
| **Companion document** | ARD (architecture & technical design) — follows this document |

> This document defines only the "what and why." All the "where and how" (paths, names, data structures, tools, deployment) lives in the ARD.

---

## 1. Summary

The inja food restaurant is made up of several departments, and each department's work processes today exist only in staff members' heads and in in-person interviews. The goal of this system is to turn those interviews (audio) and their accompanying documents into a set of **structured, machine-readable processes** based on the **IDEF0 / IDEF3** standards, viewable and editable interactively.

The user — who has no technical background — must be able to upload voice notes and files, start processing, and view and correct the output, all without touching the server. Everything runs on a server.

The system is **multi-user**: one application, one login, and one permission system, in which each person sees and does exactly what their role allows. Only the editor changes anything; everyone else reads what has been confirmed for them, and raises comments that travel up their own chain of command.

---

## 2. Problem & Goal

**Problem.** The restaurant's process knowledge is scattered, verbal, and undocumented. Documenting it by hand with the IDEF standards is slow and requires expertise, and the primary user has neither the technical skills to work with a server nor a suitable tool.

**Goal.** A tool that turns audio interviews and documents into structured IDEF0/IDEF3 processes, with minimal friction for a non-technical user, in a reliable way that preserves change history, and with an interactive, editable output.

---

## 3. Users & Context

A person's access is made of **two independent things**: a **role**, which says what they may do, and a **scope**, which says where they may do it. A third thing, their **supervisor**, is an org-chart fact that routes their comments and grants them nothing.

Three roles:

- **Editor** — the process analyst. Conducts in-person interviews with department staff, records voice notes, collects documents. Non-technical; interacts through Telegram and the UI. **The only role that changes anything** — the sole source of edits, confirmations, and of the content-visibility policy.
- **Admin** — sees and comments, manages users, reads the activity reports. Edits nothing.
- **Reader** — sees, comments and downloads. Manages nothing and sees nothing about any other user's account.

The people:

| Person | Role | Sees | Supervises |
|---|---|---|:-:|
| The analyst | Editor | everything | — |
| Deputy manager | Admin | everything | — |
| Department head | **Reader** | one or more whole departments | **✓** |
| Department viewer | Reader | one whole department | – |
| Report reader | Reader | one report of one department | – |

- **A department head is a Reader carrying the supervisor tag.** They read, comment, download and approve their people's comments. They create no users and read no activity reports — **all user administration is done by the Editor and by Admins who see everything.**
- **Developer user:** the developer, who builds the system and gradually improves the extraction logic.
- **Context:** multi-user, runs on a server, with full change history preserved and every action attributed to the person who took it. No need to "keep the user's device on," since everything is server-side.
- **Every user has a supervisor**, except those who see everything, for whom it is optional. That chain is what comments travel up. It is *not* what bounds who may appoint whom — that is decided by role and scope alone.
- **Current departments (9):** management, accounting, warehouse, procurement, cooking, preparation, dining, cashier, logistics. The system must be **extensible** so that new departments (e.g. QC) can be added easily in the future.

---

## 4. Goals & Non-Goals

**Goals (v1):**
- Structured intake of voice notes and documents via Telegram.
- Processing voice into IDEF0/IDEF3 processes, which the user starts and steers via Telegram.
- An interactive UI for viewing/editing processes and sub-processes (developed alongside the rest).
- Full history of the output preserved.
- **Department reports** the staff of a department can read for themselves, and take away as a printable file (§7.7).
- **Multiple users with roles and per-person access** (§7.8), so each person reaches only what they should.
- **A comment channel** from the people doing the work to the editor, routed up the chain of command (§7.10).
- **A record of who did what** — logins, readership, downloads, and time in the system (§7.11).

**Non-Goals (v1):**
- Automatic KPI generation or statistical analysis over processes.
- Support for other languages/restaurants.
- Self-registration. Accounts are created inside the system by someone who already has one; there is no sign-up.

> **Reversed in v0.4.** Through v0.3 this section read *"PDF/Word output — the final output is intentionally interactive, not a static document."* That was rejecting a **replacement** for the interactive product, and it still is. What shipped is different in kind: a **derived, read-only document generated from the same data**, for the audience that will never log in (kitchen staff on a phone). The interactive UI remains the product and the only place anything is edited; an export is a build artifact that can be regenerated or thrown away at any time (INV-6). Word output remains out of scope.

> **Reversed in v0.5.** Through v0.4 the first Non-Goal read *"Multi-user support or role management … there is no per-person account, attribution, or role anywhere."* That is now the opposite of the product's direction, and it is withdrawn rather than edited, so the reversal stays visible. The reasoning that produced it — that a user system was an ops burden the product did not need — held only while the sole audience was one analyst plus anonymous readers behind a shared password. Once readers must be told apart, comment, and be held to a chain of approval, per-person accounts became the honest answer, exactly as §12 anticipated. **NFR-11 is withdrawn with it**: the structural separation between the export credential and the analyst credential existed because export readers had no accounts, and one permission system now replaces two credential systems (§7.7, §7.8).

---

## 5. v1 Scope

**In scope:** upload bot, control bot, process-extraction pipeline, the process/department content model, the interactive UI, the department reports, and the access, comment and activity-logging system — all together.

**Out of scope:** anything under "Non-Goals"; and cost optimization (for now the strongest model is used for everything on purpose — see NFR).

---

## 6. System Overview

The system consists of seven components that communicate **only through shared storage on the server**. Each one's role:

1. **Upload bot:** raw intake of voice/documents from the user and storing them on the server. No processing.
2. **Control bot:** the user starts processing and manages sessions via Telegram, with no technical work on the server.
3. **Extraction processing:** turns the voice into IDEF0/IDEF3 processes.
4. **Central data:** the system's source of truth; the output of every stage lives here and its history is preserved.
5. **Interactive UI:** one application for everyone. What each person sees and may do is decided by their role; the editor edits, everyone else reads, downloads and comments.
6. **Department reports:** derived read-only documents of a department's processes, read in the application and downloadable as a printable file. They only ever *read* the central data, and are build artifacts kept **outside** it (§7.7).
7. **Access, comments and activity record:** who each person is, what they may reach, what they have said about a process, and what they have done in the system. This is the only part of the system that is *about people* rather than about processes, and it is kept separately from the process data (§7.8–§7.11).

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
- **FR-I3 (view & edit):** The UI's default mode is **view-only**; the user sees processes and flowcharts without anything being accidentally changeable. Only by pressing the **"Edit"** button does the editor open and the user can edit/delete/add and reposition parts. Changes are written only when the user presses **"Save"** (not automatically on every change). For a user without edit permission the button does not exist at all, and the permission is enforced by the system independently of whether the button was drawn (§7.8).
- **FR-I4 (review inbox):** Conflicts are shown with a diff and accept/reject buttons, and the user's decision is saved.
- **FR-I5 (manual creation):** The user can manually create a new process for a department; the system assigns an ID and the process is built with the standard structure from the start.
- **FR-I6 (retired processes):** Retired (tombstoned) processes are still **shown** in the UI, clearly labelled as retired and **view-only** (they cannot be edited), with links to the process or processes that **replaced** them. From here the user can trigger a **permanent delete** of a retired process (the one allowed manual deletion; see INV-4).
- **FR-I7 (reordering processes):** The user can rearrange a department's process order in the UI through a dedicated reorder view, and the change is saved only when they confirm it — like every other edit (see FR-I3). Retired processes take no part in the order and are shown after the ordered ones.
- **FR-I8 (downloading a report):** A user with download permission can take away any report they can read, as a printable file. When the file has to be produced rather than reused, a **loading state is shown**, so a wait of tens of seconds never looks like a frozen screen.
  > **Reversed in v0.5.** Through v0.4 this requirement was *"requesting an export"* — the user generated a document and was handed a permanent link to pass on, together with a note about the shared password the recipient would need. Reports are now read in the application by people who have their own accounts, so there is nothing to hand out and no second credential to explain.

### 7.7 Department Reports

The audience here is **not only the analyst**. It is the department's own staff — a cook, a cashier, a waiter — reading on a phone. They now have their own accounts and reach a report by signing in, not by following a link someone forwarded them.

- **FR-E1 (two kinds, extensible):** A department can be reported in two forms: a **flowchart document** (the official record: each process's diagram, in the department's curated order) and a **step-by-step guide** (the same processes rewritten as ordered steps for someone doing the job). They are separate reports, reached separately. **More report kinds will be added**, and adding one must not require changing how permissions are expressed — access can be granted to a specific report of a specific department.
- **FR-E2 (fidelity):** The flowchart in a report must be **the same flowchart the system shows on screen** — not a redrawing that can drift from it. What the editor confirms is what the staff member reads.
- **FR-E3 (the downloaded file is self-contained):** A downloaded report is a **single file that opens on its own** — no server, no network, no installation. Emailed, or opened from a phone's storage months later, it still works. It carries no live link back to the system.
- **FR-E4 (a report is always current):** A report shows the department as it stands now. There is no snapshot to refresh and no archive of past versions. A downloaded copy is a snapshot by nature (FR-E9); the report itself is not.
  > **Reversed in v0.5.** Through v0.4 this read *"Each department+kind has one document at one permanent link. Re-exporting replaces it in place."* The permanent link existed so a document could be forwarded to people with no accounts. They have accounts now, and a stable public URL per department is exactly what should not exist once access is per-person.
- **FR-E5 (printable):** Each report can be turned into a **file suitable for printing and posting on a wall**, with no diagram, label, or step ever cut in half across a page boundary. Producing it must work on a phone, not only on a laptop.
- **FR-E6 (read-only and clean):** A report carries no editing affordances and no half-finished internal state — no edit/undo/layout/save controls, and no pending-conflict markers. Retired processes are excluded, and so is anything not yet confirmed (FR-V4). A reader sees the settled picture.
- **FR-E7 (access is the system's own permissions):** Reports are reached with the reader's own account, under the same permission system as everything else (§7.8). Access may be granted to a whole department or to one report of one department, and the ability to download may be withheld from a person who may still read.
  > **Reversed in v0.5.** Through v0.4 this read *"one shared username and password for the whole export system … it opens the documents and nothing else."* That shared credential, its separate sign-in page (former FR-E8), and NFR-11's requirement that the two mechanisms be structurally separate are all **withdrawn**. They existed because readers had no accounts; the separation they enforced is now expressed as permissions on real people, which is also the only way to revoke one person's access without changing everyone's password.
- **FR-E8 (withdrawn in v0.5):** *Was: a separate Persian sign-in page for exports.* There is one sign-in page for the whole system.
- **FR-E9 (a downloaded file is not recoverable):** A copy of a report that someone has already downloaded opens forever, offline, with no server involved, and does not change when the process changes. This is inherent to FR-E3 and is stated so it is never mistaken for something permissions prevent.

### 7.8 Users, Roles & Access

> **Revised in v0.6.** Through v0.5 this section described five ranked roles, each carrying a level number and a scope of its own, and allowed any single permission to be added to or removed from one person. Ranks, role-owned scope, and per-person exceptions are all withdrawn. A rank is a hand-maintained stand-in for "has less authority" that can disagree with the truth; comparing what two people may actually do settles the same question from the facts. And a permission attached to one person is a second, invisible rulebook — the answer to *"why can this person download?"* must live in exactly one place.

- **FR-A1 (accounts are created in-system):** Usernames and passwords are defined inside the system by someone who already has an account. There is no self-registration. Every user can change their own password from their own panel. Someone who manages users can also **set another user's password directly, choosing it themselves** — for the people they are allowed to manage (FR-A7), in one step, with no link to send and nothing to wait for. Every such change is recorded against the person who made it (FR-L1).
- **FR-A2 (a role says what, a scope says where):** A **role** is a named set of things a person may do, and carries no scope of its own. A **scope** is attached to the person. One user holds one role and one or more scopes. A head of two departments is one person with two scopes, not a special kind of user.
- **FR-A3 (what a person may be permitted):** See content, comment on it, download reports, manage users, appoint someone with the same permissions as oneself, read the activity reports, edit content, confirm content, and set the content-visibility policy.
- **FR-A4 (what a person may reach):** Scope is the whole system, a whole department, or a single report of a single department. A scope covering a whole department includes reports added later; one covering a single report never widens to include a new one.
- **FR-A5 (the last three permissions can never be created):** Editing, confirming, and setting the content-visibility policy can only exist in roles established when the system is first set up. **No user, including the editor, can build a new role that contains them** — not by any screen and not by any request. This is a property of those permissions themselves, not a restriction on a particular account, so it cannot be lost by renaming, adding, or replacing an administrator.
- **FR-A6 (no exceptions for individuals):** There is no way to add or remove a single permission for a single person. If an exception is genuinely needed, it becomes a new role — and new roles can be freely composed from the six permissions that are not covered by FR-A5.
- **FR-A7 (who may appoint whom):** Managing users requires the permission to do so, which readers do not have. Beyond that, one rule: **the person being created must be able to do strictly less than their creator, and reach no further.** Appointing someone with exactly one's own permissions is a separate permission of its own, held by editors and administrators. So an administrator may appoint another administrator but never an editor; an editor may appoint anyone; and a reader — including a department head — appoints nobody. The same rule governs changing an existing user, judged on what they would become. **Nobody may edit their own record**, apart from changing their own password.
- **FR-A8 (every user has a supervisor):** Required for everyone except users who see everything, for whom it is optional. The supervisor routes comments and grants nothing else. Anyone may be a supervisor, including a reader — being one is a separate mark set on a person, not something their permissions imply. The candidates offered are the people whose own access covers the new user's, and the system refuses a choice that would create a loop.
- **FR-A9 (disabling a user):** A user can be disabled at any time; their access ends immediately, including any session already open. Disabling never requires reorganising their subordinates first and never cascades to them. Where a disabled person is left as someone's supervisor, the system says so and offers to reassign.
- **FR-A10 (permissions are enforced by the system, not by the screen):** What a person sees drawn on screen is a convenience. Whether the system will actually give them something is decided independently, every time they ask for it.
- **FR-A11 (readers see nothing about other users):** A reader is shown no list of users, no user's details, and no part of the user-administration screens. The one place another person's name reaches them is inside a comment they are already entitled to read — its author, and whoever approved, rejected or resolved it (FR-K7, FR-K10). Without that the comment system would be unreadable.

### 7.9 Confirmation & Content Visibility

- **FR-V1 (confirmation):** The editor can mark a flowchart, or a department's general information, as **confirmed** — a statement to everyone else that it has been reviewed and is to be trusted.
- **FR-V2 (a confirmation applies to a version, not a name):** If the thing changes in any way after being confirmed — by an edit in the UI, by a chat instruction, or by a processing run — the confirmation is **no longer valid** and the editor must confirm it again. A confirmation must never be able to vouch for something that has since changed.
- **FR-V3 (positions count):** Moving parts of a flowchart changes the document as the reader experiences it, so it also invalidates the confirmation.
- **FR-V4 (unconfirmed content is not shown):** Anything without a valid confirmation is invisible to everyone except the editor, and is left out of reports.
- **FR-V5 (what is shown of a process is one global decision):** Which parts of a process are shown to non-editors — its summary, its IDEF0 information, its KPIs, and for each step its description, its performer and its IDEF0 information — is a **single setting that applies identically to every non-editor**, and only the editor may change it. A step's name, the connections between steps, and the links to sub-processes are always shown; without them there is no flowchart to read. It is deliberately not a per-person permission: if it were, anyone who can create users could expose it without the editor ever deciding to. What differs between people is *which departments and reports they reach*, never *which fields*.
- **FR-V6 (internal bookkeeping is never shown):** Which recording something came from, unresolved proposals, and internal timestamps are never shown to anyone but the editor and cannot be switched on by anyone, including the editor. This is NFR-12, now applying everywhere rather than only to a downloaded file.

### 7.10 Comments

- **FR-K1 (who comments, and on what):** A user with permission may leave a comment on a **department's general information**, on a **whole flowchart**, or on **one step of a flowchart**.
- **FR-K2 (comments travel up the chain):** A comment does not go straight to the editor. It goes to the author's supervisor, and on approval to *their* supervisor, until the chain reaches the editor. Only then is it shown to the editor.
- **FR-K3 (what a supervisor may do):** Approve, reject with a reason, or amend the wording and approve. An amendment never overwrites the author's original words — both are kept, so a change made on someone's behalf can always be seen.
- **FR-K4 (rejection returns it):** A rejected comment goes back to its author with the reason. They may revise it, which starts the chain again from the beginning.
- **FR-K5 (the author's control ends at the first approval):** The author may edit or withdraw their comment only while no one has approved it. Once someone has, the words are fixed — an approval vouches for what was actually written, and must not be able to be changed underneath the person who gave it. Stopping an approved-in-progress comment requires an approver to reject it, which leaves a record.
- **FR-K6 (nothing is deleted):** Withdrawn and rejected comments remain on record. A supervisor's refusal to pass something on must leave a trace.
- **FR-K7 (who can see a comment):** Its author; every supervisor above the author, at any stage; and the editor once it has cleared the chain. Seeing every department does not by itself mean seeing that department's comments.
- **FR-K8 (a comment survives its subject):** A comment records enough about what it was written on — the department, the process, the wording of the step — that it still makes sense if that process is later restructured or retired. It is never silently re-pointed at something else.
- **FR-K9 (an approved comment can be acted on by instruction):** Every comment has a short identifier, so the editor can tell the system in Telegram to go and address a specific one. Only comments that have cleared the whole chain can be reached this way.
- **FR-K10 (everyone who saw it sees how it ended):** When a comment is resolved or rejected, everyone who could see it sees who did so, when, and why — along with a reference to the change, if one was made.
- **FR-K11 (nobody is notified out of band):** A person with a comment waiting on them sees it when they open the system, and the longest-waiting comments are surfaced so a blocked chain is visible. There is no notification outside the application.

### 7.11 Activity Record

- **FR-L1 (what is recorded):** Every sign-in and failed sign-in, sign-out, password change, permission and role change, user creation and disabling, comment action, edit, and confirmation.
- **FR-L2 (readership is recorded):** Which reports and departments each person opened, when, and what they downloaded.
- **FR-L3 (time in the system):** How long each person was actually present — measured as real activity, not as the time between signing in and closing a laptop.
- **FR-L4 (reports over the record):** The record can be read as reports: activity per person, readership per report, access per department, failed sign-in attempts, the history of every permission change and who made it, and how comments are flowing.
- **FR-L5 (who may read it):** Only users granted that permission.
- **FR-L6 (the record cannot be edited):** No user, including the editor, can delete or alter an entry through the system. A record the top user can rewrite records nothing.

---

## 8. User Flows

**Main flow (extraction):** The user records the meetings ← in the upload bot enters the date and departments and sends the voices ← in the control bot points a run at a department (or an explicit list of recordings) and says "process" ← the system shows the **set of recordings** it is about to read and the user confirms it (Gate A) ← the system reads them all together, identifies the processes, and shows the proposed process set — including any merge, split, attach, or retire — for approval (Gate B) ← the user confirms/corrects ← the system builds and reconciles the processes and the changes are recorded ← the user opens the department in the UI, views the flowcharts, edits as needed, and resolves conflicts.

**Secondary flow (manual creation & direct edits):** The user creates a new process for a department in the UI (or via chat); the system assigns an ID; the next recording that touches that same process is linked to this existing process. The user can also edit committed work — including structural changes — by a chat instruction alone, with the change recorded in the history.

**Reader flow (a staff member raises a problem):** A waiter signs in ← sees only the dining step-by-step guide, and only the processes the editor has confirmed ← finds a step that does not match how the work is really done ← leaves a comment on that step ← the comment goes to the dining head, who amends the wording and approves it ← it goes to the deputy manager, who approves ← the editor now sees it, and tells the system in Telegram to address that comment by its identifier ← the system fixes the process and records the change, which invalidates the flowchart's confirmation ← the editor reviews and confirms it again, and it becomes visible to the waiter once more, who sees that their comment was resolved and by whom.

---

## 9. Non-Functional Requirements (NFR)

- **NFR-1 (Telegram access):** Only registered Telegram IDs (for now, only the primary user) are allowed to use either bot; others are silently rejected.
- **NFR-2 (large audio files):** The system must be able to receive and process large meeting audio files (which are usually large) without issue.
- **NFR-3 (authentication):** Every user signs in with their own username and password. Passwords are stored securely, never in plaintext, and a user can change only their own. Sessions can be ended by the system at once — disabling a user or reducing their access takes effect immediately, not whenever their session happens to expire.
  > **Amended in v0.5.** Through v0.4 this read *"UI login is protected by a username and password, with no database required."* The "no database" clause was a constraint on the single-user design; it cannot survive a mutable user list, revocable sessions, or an activity record, and is withdrawn. Process content is unaffected — it stays where it is, in the versioned central data (ARD §13.1).
- **NFR-4 (model):** All processing uses the strongest model (Opus 4.8), even for simple tasks. This is a quality-driven choice and can be changed later.
- **NFR-5 (time & budget):** The time and cost budget for processing must be set to match the multi-stage, high-cost nature of each run.
- **NFR-6 (robustness on large voices):** Processing must not fail due to the model's memory limits on long voices; the system must handle large voices without data loss.
- **NFR-7 (history & backup):** All changes — from any path (voice processing, chat, or UI) — are recorded in the history, and no change goes unrecorded. In addition, an off-site backup is taken **twice a day** (11am and 11pm, only if there is a new change).
- **NFR-8 (extensibility):** Adding a new department must be simple and must not change the system's logic.
- **NFR-9 (service durability):** The bots must run as permanent, durable services on the server.
- **NFR-10 (output integrity):** Every structured output the system produces conforms to the system's fixed data contract; a nonconforming output is detected and corrected before anything relies on it.
- **NFR-11 (withdrawn in v0.5):** *Was: the shared export credential and the analyst credential must be separate mechanisms, structurally unable to reach each other.* There is now one credential system and one set of permissions. The property this protected — that a report reader can never reach the editor — is now a consequence of that person's permissions rather than of two isolated mechanisms, and is asserted by AC-14.
- **NFR-12 (nothing carries more than it shows):** What the system hands to a person carries the content they are permitted to see and nothing else — no internal bookkeeping, no unresolved proposals, no record of which recording something came from. This holds for what appears on screen as much as for a downloaded file: what is withheld is never merely hidden from view.
- **NFR-13 (a failed printable form never costs the report):** Producing the printable form is an enhancement. If it fails, the report is still readable; the failure is recorded for the operator rather than shown to the user as a broken report.
- **NFR-14 (the activity record is complete and tamper-resistant):** Every action listed in §7.11 is recorded, with the person who took it. The record is kept where no automated part of the system can reach it, and there is no path — for any role — to alter or delete an entry.
- **NFR-15 (usable on a phone):** The application works on the devices its users actually have. Staff read and comment on phones; the interface must be built for that rather than adapted to it.
- **NFR-16 (people-data is backed up too):** Users, permissions, comments and the activity record are backed up on the same schedule as the process data. The existing history mechanism does not cover them, so NFR-7's promise is met for them by a separate path or not at all.

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
- **AC-8:** An unauthorized Telegram ID cannot use the bots, and the UI does not open without a correct username/password belonging to an enabled user.
- **AC-9:** A wrong or over-fragmented baseline from an earlier run is **correctable by a later run**: two processes that should be one are merged, and one that is really two is split, rather than the mistake being locked in.
- **AC-10:** A retired process is **tombstoned** (not deleted), shown as retired with links to what replaced it, and can be **permanently deleted by the user**, after which its id is never reused.
- **AC-11:** After the user rearranges a department's processes in the UI, that order is what the list shows when reopened, it survives a later processing run, and a new top-level process created afterwards appears at the end of the order rather than in an arbitrary position; a sub-process or restructure heir is positioned per ARD §4.6.
- **AC-12:** Both reports of a department can be read in the application by a user permitted to see them, and reflect the department as it currently stands. The flowchart in a report matches the one the UI shows for the same process.
- **AC-13:** A downloaded report opened with **no network at all** — double-clicked from a downloads folder — renders completely: diagrams, Persian text, and layout.
- **AC-14:** A user whose only permission is one report of one department can open that report and nothing else: not the other report, not another department, not any process, and not any editing action — and this holds when the request is made directly, not only when the buttons are absent.
- **AC-15:** The printable form of a flowchart report contains no diagram, node label, or step split across a page boundary, and can be produced from a phone.
- **AC-16:** A user cannot create or modify anyone who would be able to do more than they can, or reach further than they can. An administrator can create another administrator but never an editor; a reader — including a department head — creates nobody; nobody can edit their own record; and no request of any kind, made by anyone including the editor, produces a role that can edit, confirm, or change the content-visibility policy.
- **AC-23:** The supervisor offered for a new user is only ever someone whose own access covers that user's, a choice that would create a loop is refused, and a person given two departments can only be supervised by someone who sees everything.
- **AC-24:** A reader who requests the user list, another user's details, or the supervisor picker is refused — while the comments they are entitled to read still show who wrote them and who acted on them.
- **AC-17:** Disabling a user ends their access immediately, including a session already open, without requiring their subordinates to be reorganised first.
- **AC-18:** A confirmed flowchart becomes invisible to non-editors the moment it is changed by any path — an edit in the UI, a chat instruction, a processing run, or a change to the positions of its parts — and becomes visible again only when confirmed anew.
- **AC-19:** A comment left by a report reader reaches the editor only after every supervisor in the chain has approved it; a rejection returns it to its author with the reason; and once anyone has approved it, its author can neither change nor withdraw it.
- **AC-20:** The editor can tell the system in Telegram to address a comment by its identifier, and the system can read that comment and mark it resolved. A comment that has not cleared the chain cannot be read this way.
- **AC-21:** Turning off the visibility of a field hides it from every non-editor at once, and it cannot be turned back on by anyone other than the editor — including by a user who can create other users.
- **AC-22:** The activity record shows who signed in, who opened which report, who downloaded what, and how long each person was present; and no user, at any permission level, can delete an entry through the system.

---

## 12. Open Items & Future

- Adding new departments (QC, etc.) — the mechanism is ready, each department's content comes later.
- Cost optimization with cheaper models for lightweight stages (for now, all Opus 4.8 on purpose).
- Filling in KPIs (which are usually not stated in a process-description interview) via a separate question or manual entry.
- ~~Department process export~~ — **shipped** in v0.4 (§7.7). It follows the process order of FR-D12, which is why that order was recorded explicitly before the export existed.
- ~~**Export follow-ups, deliberately not done.**~~ — **resolved** in v0.5. That item ended *"the point at which per-person accounts would become the honest answer."* That point arrived. Revoking one person's access no longer requires changing a password everyone shares, and a session can be ended at once.
- Word/Office output — still out of scope. The two reports plus print cover the need.
- **Telegram notification of comments** — a person with a comment waiting on them learns of it when they next open the system (FR-K11). Notifying them in Telegram would need a Telegram identity on every user and a delivery path that does not exist; deliberately deferred.
- **Password policy** — minimum strength, forced change on first sign-in, and lock-out after repeated failed attempts are not yet specified. Note that no attempt-rate limit exists on any sign-in today.
- **How long the activity record is kept** — indefinitely for now. "Who read what" is information about people, and keeping it forever should be a decision rather than a default.
- **Further report kinds** — the system is built so a new report is a new entry that permissions can already address (FR-E1, FR-A4); none are specified yet.
- **What each role's screens look like** — deliberately not decided in this document or in the architecture. Whether a reader gets the editor's pages, a document, or something built for them is a design question, answered after this document and the ARD are settled.

---

## 13. Deferred to the ARD

These technical topics are intentionally excluded from the PRD and appear in the ARD: folder structure and naming; the exact process data structure; the design of the processing and its technical components; how the ordering of stages is guaranteed; the separation of the code and data environments and how development is done; the layout algorithm; the authentication and access mechanism; where users, permissions, comments and the activity record are stored and how they are kept apart from the process data; how a confirmation is bound to a version; how the Telegram runtime reaches an approved comment; and how the services are deployed on the server.
