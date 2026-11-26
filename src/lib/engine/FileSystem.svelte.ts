import { SvelteMap } from 'svelte/reactivity';

/** Inhalt einer Datei: Text oder Binärdaten (z. B. Bilder). */
export type FileContent = string | Uint8Array;

// Binärdateien werden beim Speichern als Base64 abgelegt
type SavedFileContent = string | { base64: string };

export type SavedFileSystem = {
	files?: Record<string, SavedFileContent>;
	deleted?: string[];
	directories?: string[];
};

function sameContent(a: FileContent, b: FileContent): boolean {
	if (typeof a === 'string' || typeof b === 'string') return a === b;
	return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/**
 * Sehr einfaches, simuliertes Dateisystem eines Hosts.
 * Dateien werden über ihren absoluten Pfad (z. B. "/var/www/html/index.html") adressiert,
 * Verzeichnisse existieren implizit, sobald eine Datei darin liegt (oder sie explizit angelegt wurden).
 */
export class FileSystem {
	public files = new SvelteMap<string, FileContent>();
	public directories = new SvelteMap<string, true>();

	/**
	 * @param defaults Standarddateien (absoluter Pfad -> Inhalt), mit denen das Dateisystem startet.
	 *   Beim Speichern werden nur Abweichungen davon abgelegt.
	 */
	constructor(private readonly defaults: Record<string, FileContent> = {}) {
		this.reset();
	}

	/**
	 * Normalisiert einen Pfad: entfernt doppelte Slashes, "." und löst ".." auf.
	 * Ein ".." oberhalb der Wurzel wird ignoriert.
	 */
	public static normalize(path: string): string {
		const parts: string[] = [];
		for (const part of path.split('/')) {
			if (part === '' || part === '.') continue;
			if (part === '..') parts.pop();
			else parts.push(part);
		}
		return '/' + parts.join('/');
	}

	public static join(...segments: string[]): string {
		return FileSystem.normalize(segments.join('/'));
	}

	public static dirname(path: string): string {
		const normalized = FileSystem.normalize(path);
		const index = normalized.lastIndexOf('/');
		return index <= 0 ? '/' : normalized.slice(0, index);
	}

	public mkdir(path: string): void {
		let current = FileSystem.normalize(path);
		while (!this.directories.has(current)) {
			this.directories.set(current, true);
			if (current === '/') break;
			current = FileSystem.dirname(current);
		}
	}

	public isDirectory(path: string): boolean {
		return this.directories.has(FileSystem.normalize(path));
	}

	public isFile(path: string): boolean {
		return this.files.has(FileSystem.normalize(path));
	}

	public readFile(path: string): FileContent | undefined {
		return this.files.get(FileSystem.normalize(path));
	}

	public writeFile(path: string, content: FileContent): void {
		const normalized = FileSystem.normalize(path);
		this.mkdir(FileSystem.dirname(normalized));
		this.files.set(normalized, content);
	}

	public deleteFile(path: string): void {
		this.files.delete(FileSystem.normalize(path));
	}

	/** Löscht ein Verzeichnis samt Inhalt. Die Wurzel "/" kann nicht gelöscht werden. */
	public deleteDirectory(path: string): void {
		const dir = FileSystem.normalize(path);
		if (dir === '/') return;
		const prefix = dir + '/';
		for (const file of [...this.files.keys()]) {
			if (file.startsWith(prefix)) this.files.delete(file);
		}
		for (const other of [...this.directories.keys()]) {
			if (other === dir || other.startsWith(prefix)) this.directories.delete(other);
		}
	}

	/**
	 * Benennt eine Datei bzw. ein Verzeichnis (samt Inhalt) um oder verschiebt es.
	 * Wirft einen Fehler mit verständlicher Meldung, wenn das nicht möglich ist.
	 */
	public move(fromPath: string, toPath: string): void {
		const from = FileSystem.normalize(fromPath);
		const to = FileSystem.normalize(toPath);
		if (from === to) return;
		if (from === '/') throw new Error('Das Wurzelverzeichnis kann nicht verschoben werden.');
		if (this.isFile(to) || this.isDirectory(to)) throw new Error(`${to} existiert bereits.`);
		if (this.isFile(FileSystem.dirname(to))) {
			throw new Error(`${FileSystem.dirname(to)} ist eine Datei und kein Verzeichnis.`);
		}

		const content = this.files.get(from);
		if (content !== undefined) {
			this.writeFile(to, content);
			this.files.delete(from);
			return;
		}
		if (!this.isDirectory(from)) throw new Error(`${from} existiert nicht.`);
		if (to.startsWith(from + '/')) {
			throw new Error('Ein Verzeichnis kann nicht in sich selbst verschoben werden.');
		}

		const prefix = from + '/';
		const rename = (path: string) => to + path.slice(from.length);
		for (const [path, data] of [...this.files]) {
			if (!path.startsWith(prefix)) continue;
			this.files.delete(path);
			this.writeFile(rename(path), data);
		}
		for (const dir of [...this.directories.keys()]) {
			if (dir !== from && !dir.startsWith(prefix)) continue;
			this.directories.delete(dir);
			this.mkdir(rename(dir));
		}
	}

	/**
	 * Gespeicherter Zustand – nur die Abweichungen von den Standarddateien:
	 * geänderte/neue Dateien, gelöschte Standarddateien und leere Verzeichnisse
	 * (alle anderen Verzeichnisse ergeben sich aus den Dateipfaden).
	 */
	public toJSON(): SavedFileSystem {
		const files: Record<string, SavedFileContent> = {};
		for (const [path, content] of this.files) {
			const original = this.defaults[path];
			if (original !== undefined && sameContent(original, content)) continue;
			files[path] = typeof content === 'string' ? content : { base64: bytesToBase64(content) };
		}
		const deleted = Object.keys(this.defaults).filter((path) => !this.files.has(path));
		const directories = [...this.directories.keys()].filter((dir) => this.isEmptyDirectory(dir));

		return {
			...(Object.keys(files).length > 0 && { files }),
			...(deleted.length > 0 && { deleted }),
			...(directories.length > 0 && { directories })
		};
	}

	/** Stellt den gespeicherten Zustand wieder her: Standarddateien + gespeicherte Abweichungen. */
	public load(data: SavedFileSystem | undefined): void {
		this.reset();
		if (!data) return;
		for (const path of data.deleted ?? []) this.deleteFile(path);
		for (const dir of data.directories ?? []) this.mkdir(dir);
		for (const [path, content] of Object.entries(data.files ?? {})) {
			this.writeFile(path, typeof content === 'string' ? content : base64ToBytes(content.base64));
		}
		// Verzeichnisse, die nur durch (jetzt gelöschte) Standarddateien entstanden sind, entfernen.
		// Gewollt leere Verzeichnisse stehen in data.directories.
		const keep = (data.directories ?? []).map((dir) => FileSystem.normalize(dir));
		let removed = true;
		while (removed) {
			removed = false;
			for (const dir of [...this.directories.keys()]) {
				if (!keep.includes(dir) && this.isEmptyDirectory(dir)) {
					this.directories.delete(dir);
					removed = true;
				}
			}
		}
	}

	/** Setzt das Dateisystem auf die Standarddateien zurück. */
	private reset(): void {
		this.files.clear();
		this.directories.clear();
		this.mkdir('/');
		for (const [path, content] of Object.entries(this.defaults)) this.writeFile(path, content);
	}

	private isEmptyDirectory(dir: string): boolean {
		if (dir === '/') return false;
		const prefix = dir + '/';
		for (const path of this.files.keys()) if (path.startsWith(prefix)) return false;
		for (const other of this.directories.keys()) if (other.startsWith(prefix)) return false;
		return true;
	}
}
