from dataclasses import dataclass, field


@dataclass
class VoiceUpload:
    date: str | None = None
    departments: list = field(default_factory=list)

    def toggle_department(self, code):
        if code in self.departments:
            self.departments.remove(code)
        else:
            self.departments.append(code)

    def ready(self):
        return self.date is not None and len(self.departments) > 0


@dataclass
class FileBatch:
    department: str | None = None
    files: list = field(default_factory=list)  # list of (original_name, staged_path)

    def add_file(self, original, staged_path):
        self.files.append((original, staged_path))

    def ready(self):
        return self.department is not None and len(self.files) > 0
