declare module 'parquetjs' {
  export interface ParquetSchema {
    new (fields: Record<string, any>): ParquetSchema;
  }

  export interface ParquetWriter {
    appendRow(row: Record<string, any>): Promise<void>;
    close(): Promise<void>;
  }

  export interface ParquetReader {
    getCursor(): ParquetCursor;
    close(): Promise<void>;
  }

  export interface ParquetCursor {
    next(): Promise<Record<string, any> | null>;
  }

  export class ParquetWriter {
    static openFile(schema: ParquetSchema, path: string): Promise<ParquetWriter>;
  }

  export class ParquetReader {
    static openFile(path: string): Promise<ParquetReader>;
  }

  export class ParquetSchema {
    constructor(fields: Record<string, any>);
  }
}
