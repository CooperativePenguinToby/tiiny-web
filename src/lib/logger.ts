// NOTE: A tracking system such as Sentry should replace the console

export const LogLevel = { NONE: "NONE", ERROR: "ERROR", WARN: "WARN", DEBUG: "DEBUG", ALL: "ALL" } as const;

const LogLevelNumber = { NONE: 0, ERROR: 1, WARN: 2, DEBUG: 3, ALL: 4 } as const;

export interface LoggerOptions {
	prefix?: string;
	level?: keyof typeof LogLevel;
	showLevel?: boolean;
}

export class Logger {
	private levelNumber: number;

	protected prefix: string;
	protected level: keyof typeof LogLevel;
	protected showLevel: boolean;

	debug = (...arguments_: unknown[]): void => {
		if (this.canWrite(LogLevel.DEBUG)) {
			this.write(LogLevel.DEBUG, ...arguments_);
		}
	};

	warn = (...arguments_: unknown[]): void => {
		if (this.canWrite(LogLevel.WARN)) {
			this.write(LogLevel.WARN, ...arguments_);
		}
	};

	error = (...arguments_: unknown[]): void => {
		if (this.canWrite(LogLevel.ERROR)) {
			this.write(LogLevel.ERROR, ...arguments_);
		}
	};

	constructor({ prefix = "", level = LogLevel.ALL, showLevel = true }: LoggerOptions) {
		this.prefix = prefix;
		this.level = level;
		this.levelNumber = LogLevelNumber[this.level];
		this.showLevel = showLevel;
	}

	private canWrite(level: keyof typeof LogLevel): boolean {
		return this.levelNumber >= LogLevelNumber[level];
	}

	private write(level: keyof typeof LogLevel, ...arguments_: unknown[]): void {
		let prefix = this.prefix;

		if (this.showLevel) {
			prefix = `- ${level} ${prefix}`;
		}

		if (level === LogLevel.ERROR) {
			console.error(prefix, ...arguments_);
		} else {
			console.log(prefix, ...arguments_);
		}
	}
}

// This can be extended to create context specific logger (Server Action, Router Handler, etc.)
// to add context information (IP, User-Agent, timestamp, etc.)

export function createLogger({ prefix, level }: LoggerOptions = {}): Logger {
	return new Logger({ prefix, level });
}
