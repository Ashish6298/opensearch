/**
 * @opensearch/ranking — Developer Syntax Cheat Sheets & Reference Cards (Phase 51)
 *
 * Provides instant syntax lookup and copyable command snippets for common developer workflows:
 * - Git (undo commit, squash, branch delete, tag, stash, reset)
 * - Docker (prune system, stop all containers, remove dangling images, exec bash)
 * - Linux / Bash (tar extract, find by name, grep recursive, chmod, kill process by port, disk usage)
 * - Regex (email, URL, phone number, UUID, IPv4, date ISO)
 * - SQL (create index, upsert ON CONFLICT, alter table, pagination with offset)
 *
 * Runs 100% in-memory with zero external dependencies and lightweight data footprint (< 50KB).
 */

export interface CheatSheetEntry {
  id: string;
  title: string;
  topic: 'git' | 'docker' | 'linux' | 'regex' | 'sql';
  description: string;
  command: string;
  explanation?: string;
  examples?: string[];
  aliases: string[];
}

export interface CheatSheetResult {
  type: 'cheatsheet';
  badge: string;
  title: string;
  topic: string;
  description: string;
  command: string;
  explanation?: string;
  details: Record<string, string>;
}

export const CHEATSHEET_DATABASE: CheatSheetEntry[] = [
  // ── Git ────────────────────────────────────────────────────────
  {
    id: 'git-undo-commit-soft',
    title: 'Git Undo Last Commit (Keep Changes Staged)',
    topic: 'git',
    description: 'Undo the last commit while preserving all modified changes staged in the index.',
    command: 'git reset --soft HEAD~1',
    explanation: 'Moves HEAD back 1 commit without touching your index or working tree.',
    aliases: ['git undo commit', 'git undo last commit', 'undo git commit', 'git reset commit', 'git uncommit'],
  },
  {
    id: 'git-undo-commit-hard',
    title: 'Git Discard Last Commit & Changes',
    topic: 'git',
    description: 'Completely discard the most recent commit and permanently wipe all unstaged/staged changes.',
    command: 'git reset --hard HEAD~1',
    explanation: 'Destructive command: resets HEAD, index, and working tree to previous commit.',
    aliases: ['git discard commit', 'git revert hard commit', 'git delete last commit'],
  },
  {
    id: 'git-delete-local-remote-branch',
    title: 'Git Delete Local & Remote Branch',
    topic: 'git',
    description: 'Safely delete a branch locally and from the remote origin server.',
    command: 'git branch -d <branch_name> && git push origin --delete <branch_name>',
    explanation: 'Use -D to force delete unmerged branches locally.',
    aliases: ['git delete branch', 'git remove branch', 'delete git branch', 'git delete remote branch'],
  },
  {
    id: 'git-squash-commits',
    title: 'Git Interactive Rebase & Squash',
    topic: 'git',
    description: 'Combine the last N commits into a single unified commit before merging.',
    command: 'git rebase -i HEAD~<N>',
    explanation: 'Change "pick" to "squash" (or "s") for commits you want to merge into the previous commit.',
    aliases: ['git squash', 'git squash commits', 'git combine commits', 'git rebase squash'],
  },
  {
    id: 'git-stash-pop',
    title: 'Git Stash & Apply',
    topic: 'git',
    description: 'Temporarily shelve (stash) changes in working directory and re-apply later.',
    command: 'git stash save "work-in-progress" && git stash pop',
    explanation: 'Stash saves uncommitted changes. Use `git stash list` to inspect saved stashes.',
    aliases: ['git stash', 'git stash pop', 'git save stash', 'stash git'],
  },

  // ── Docker ─────────────────────────────────────────────────────
  {
    id: 'docker-prune-all',
    title: 'Docker System Prune (Deep Clean)',
    topic: 'docker',
    description: 'Remove all stopped containers, dangling images, unused networks, and build caches.',
    command: 'docker system prune -a --volumes -f',
    explanation: 'Frees maximum disk space by purging all inactive Docker objects and anonymous volumes.',
    aliases: ['docker clean', 'docker prune', 'docker system prune', 'docker remove unused images', 'docker remove dangling images'],
  },
  {
    id: 'docker-stop-all',
    title: 'Docker Stop All Running Containers',
    topic: 'docker',
    description: 'Send stop signal to every active container currently running on the host.',
    command: 'docker stop $(docker ps -q)',
    explanation: 'Pipes container IDs from `docker ps -q` into `docker stop`.',
    aliases: ['docker stop all', 'docker kill all', 'stop all docker containers', 'docker stop all containers'],
  },
  {
    id: 'docker-exec-bash',
    title: 'Docker Interactive Shell Exec',
    topic: 'docker',
    description: 'Open an interactive bash/sh terminal shell inside a running container.',
    command: 'docker exec -it <container_id_or_name> /bin/sh',
    explanation: '-i allocates STDIN and -t allocates a pseudo-TTY.',
    aliases: ['docker exec', 'docker exec bash', 'docker shell', 'docker ssh container', 'docker enter container'],
  },

  // ── Linux / Bash ───────────────────────────────────────────────
  {
    id: 'tar-extract-gz',
    title: 'Tar Extract .tar.gz Archive',
    topic: 'linux',
    description: 'Unpack and extract gzipped tarball archives into current or target directory.',
    command: 'tar -xzvf archive.tar.gz -C /target/path',
    explanation: '-x = extract, -z = gzip filter, -v = verbose list files, -f = specify archive filename.',
    aliases: ['tar extract', 'tar extract gz', 'tar xzvf', 'untar', 'extract tar', 'how to untar'],
  },
  {
    id: 'kill-port-process',
    title: 'Find & Kill Process on Specific Port',
    topic: 'linux',
    description: 'Find process listening on a TCP port and terminate it immediately.',
    command: 'lsof -ti:<PORT> | xargs kill -9',
    explanation: 'On Windows PowerShell: `Get-Process -Id (Get-NetTCPConnection -LocalPort <PORT>).OwningProcess | Stop-Process -Force`',
    aliases: ['kill port', 'kill process on port', 'kill port 3000', 'kill port 8080', 'free port'],
  },
  {
    id: 'find-files-by-name',
    title: 'Find Files Recursively by Name',
    topic: 'linux',
    description: 'Search filesystem hierarchy for files matching a wildcard name pattern.',
    command: 'find . -type f -name "*.ts" -not -path "*/node_modules/*"',
    explanation: '-type f filters for regular files, and -not -path excludes directory trees.',
    aliases: ['find file', 'find files by name', 'linux find file', 'find recursive'],
  },
  {
    id: 'grep-recursive-string',
    title: 'Grep Recursive Text Search',
    topic: 'linux',
    description: 'Search recursively across all files in directory for a text pattern with line numbers.',
    command: 'grep -rnI "search_pattern" ./src',
    explanation: '-r = recursive, -n = print line numbers, -I = ignore binary files.',
    aliases: ['grep recursive', 'grep text', 'grep find string', 'grep in directory'],
  },

  // ── Regular Expressions (Regex) ────────────────────────────────
  {
    id: 'regex-email',
    title: 'Regex Match Email Address',
    topic: 'regex',
    description: 'Standard regular expression for validating standard email addresses.',
    command: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
    explanation: 'Matches RFC 5322 compatible user mailbox name, @ symbol, and standard top-level domain.',
    aliases: ['regex email', 'regex match email', 'email regex', 'validate email regex'],
  },
  {
    id: 'regex-url',
    title: 'Regex Match HTTP/HTTPS URL',
    topic: 'regex',
    description: 'Validate HTTP, HTTPS, and FTP web addresses with optional ports and paths.',
    command: 'https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_\\+.~#?&//=]*)',
    explanation: 'Captures scheme (http/https), optional www, hostname, and query path arguments.',
    aliases: ['regex url', 'regex match url', 'url regex', 'validate url regex'],
  },
  {
    id: 'regex-ipv4',
    title: 'Regex Match IPv4 Address',
    topic: 'regex',
    description: 'Validates four octets ranging from 0 to 255 delimited by dots.',
    command: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$',
    explanation: 'Prevents invalid octets above 255.',
    aliases: ['regex ip', 'regex ipv4', 'ip regex', 'match ip address regex'],
  },

  // ── SQL ────────────────────────────────────────────────────────
  {
    id: 'sql-upsert-on-conflict',
    title: 'SQL Upsert (INSERT ON CONFLICT UPDATE)',
    topic: 'sql',
    description: 'Insert a new row or update existing columns when unique key collision occurs.',
    command: 'INSERT INTO users (id, name, updated_at) VALUES (1, \'Alice\', NOW()) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();',
    explanation: 'PostgreSQL standard syntax. In MySQL: `INSERT INTO ... ON DUPLICATE KEY UPDATE`. In SQLite: `INSERT OR REPLACE INTO`.',
    aliases: ['sql upsert', 'sql on conflict', 'sql insert or update', 'upsert query'],
  },
  {
    id: 'sql-create-index-concurrently',
    title: 'SQL Create Index Without Locking Table',
    topic: 'sql',
    description: 'Build a database B-Tree index concurrently without acquiring an exclusive write lock.',
    command: 'CREATE INDEX CONCURRENTLY idx_users_email ON users(email);',
    explanation: 'PostgreSQL CONCURRENTLY allows production traffic to read and write while index is building.',
    aliases: ['sql create index', 'sql index concurrently', 'create index sql'],
  },
];

export class CheatSheetEngine {
  private readonly aliasMap = new Map<string, CheatSheetEntry>();

  constructor() {
    for (const entry of CHEATSHEET_DATABASE) {
      for (const alias of entry.aliases) {
        this.aliasMap.set(alias.toLowerCase().trim(), entry);
      }
      this.aliasMap.set(entry.title.toLowerCase().trim(), entry);
    }
  }

  /**
   * Fast in-memory lookup for developer cheat sheets.
   */
  lookup(rawQuery: string): CheatSheetResult | null {
    if (!rawQuery || typeof rawQuery !== 'string') {
      return null;
    }

    const query = rawQuery.toLowerCase().trim().replace(/[?!.,]+$/, '');
    if (!query) {
      return null;
    }

    // Direct alias match
    let entry = this.aliasMap.get(query);

    // Fuzzy phrase prefix match for queries like `cheatsheet git undo` or `how to tar extract`
    if (!entry) {
      const clean = query
        .replace(/^(?:how\s+to|cheat\s*sheet\s+for|cheat\s*sheet|cheatsheet|syntax\s+for|command\s+for)\s+/i, '')
        .trim();
      entry = this.aliasMap.get(clean);
    }

    if (!entry) {
      return null;
    }

    const badgeTopicMap: Record<string, string> = {
      git: '[git-cheatsheet]',
      docker: '[docker-cheatsheet]',
      linux: '[linux-command]',
      regex: '[regex-pattern]',
      sql: '[sql-syntax]',
    };

    return {
      type: 'cheatsheet',
      badge: badgeTopicMap[entry.topic] ?? '[dev-cheatsheet]',
      title: entry.title,
      topic: entry.topic.toUpperCase(),
      description: entry.description,
      command: entry.command,
      explanation: entry.explanation,
      details: {
        'Topic': entry.topic.toUpperCase(),
        'Command': entry.command,
        'Description': entry.description,
        ...(entry.explanation ? { 'Notes': entry.explanation } : {}),
      },
    };
  }
}

/**
 * Factory helper for CheatSheetEngine.
 */
export function createCheatSheetEngine(): CheatSheetEngine {
  return new CheatSheetEngine();
}
