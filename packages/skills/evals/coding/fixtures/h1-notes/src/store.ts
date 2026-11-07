export interface Note {
  id: string;
  ownerId: string;
  title: string;
  body: string | null;
  pinned: boolean;
  updatedAt: string;
}

export interface NotesStore {
  get(id: string): Promise<Note | undefined>;
  save(note: Note): Promise<void>;
}

export function createMemoryStore(seed: Note[] = []): NotesStore {
  const notes = new Map(seed.map((note) => [note.id, { ...note }]));
  return {
    async get(id) {
      const note = notes.get(id);
      return note && { ...note };
    },
    async save(note) {
      notes.set(note.id, { ...note });
    },
  };
}
