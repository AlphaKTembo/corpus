/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';
import { ParquetWriter, ParquetReader, ParquetSchema } from 'parquetjs';

export class ParquetWriterService {
  private corpusRoot: string;

  constructor(corpusRoot: string) {
    this.corpusRoot = corpusRoot;
  }

  async initialize(): Promise<void> {
    // No initialization needed for parquetjs
  }

  async close(): Promise<void> {
    // No cleanup needed for parquetjs
  }

  private inferParquetType(value: any): string {
    if (value === null || value === undefined) {
      return 'UTF8';
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'INT64' : 'DOUBLE';
    }
    if (typeof value === 'boolean') {
      return 'BOOLEAN';
    }
    if (value instanceof Date) {
      return 'TIMESTAMP_MILLIS';
    }
    return 'UTF8';
  }

  private buildSchema(data: Record<string, any>[]): ParquetSchema {
    if (data.length === 0) {
      throw new Error('Cannot build schema from empty data');
    }

    const schemaFields: Record<string, any> = {};
    const sample = data[0];

    for (const [key, value] of Object.entries(sample)) {
      const type = this.inferParquetType(value);
      schemaFields[key] = { type, optional: true };
    }

    return new ParquetSchema(schemaFields);
  }

  async writeCanonicalTable<T extends Record<string, any>>(
    tableName: string,
    data: T[],
    schema?: Record<string, string>,
  ): Promise<void> {
    if (data.length === 0) {
      return;
    }

    const canonicalPath = path.join(this.corpusRoot, 'canonical');
    fs.mkdirSync(canonicalPath, { recursive: true });
    const filePath = path.join(canonicalPath, `${tableName}.parquet`);

    const parquetSchema = this.buildSchema(data);
    const writer = await ParquetWriter.openFile(parquetSchema, filePath);

    try {
      for (const row of data) {
        await writer.appendRow(row);
      }
      await writer.close();
    } catch (error) {
      await writer.close();
      throw error;
    }
  }

  async appendCanonicalTable<T extends Record<string, any>>(
    tableName: string,
    data: T[],
  ): Promise<void> {
    if (data.length === 0) {
      return;
    }

    const filePath = path.join(this.corpusRoot, 'canonical', `${tableName}.parquet`);
    
    // If file exists, read existing data and merge
    let existingData: T[] = [];
    if (fs.existsSync(filePath)) {
      try {
        const reader = await ParquetReader.openFile(filePath);
        const cursor = reader.getCursor();
        const rows: T[] = [];
        
        let row = await cursor.next();
        while (row) {
          rows.push(row as T);
          row = await cursor.next();
        }
        
        await reader.close();
        existingData = rows;
      } catch (error) {
        console.warn(`Could not read existing ${tableName}.parquet, creating new file`);
      }
    }

    // Merge and deduplicate (assuming activity_id or similar unique key)
    const merged = [...existingData, ...data];
    const uniqueKey = this.getUniqueKey(tableName);
    const deduplicated = uniqueKey
      ? Array.from(new Map(merged.map((item) => [item[uniqueKey], item])).values())
      : merged;

    await this.writeCanonicalTable(tableName, deduplicated);
  }

  async writeDerivedTable<T extends Record<string, any>>(
    tableName: string,
    data: T[],
  ): Promise<void> {
    if (data.length === 0) {
      return;
    }

    const derivedPath = path.join(this.corpusRoot, 'derived');
    fs.mkdirSync(derivedPath, { recursive: true });
    const filePath = path.join(derivedPath, `${tableName}.parquet`);

    const parquetSchema = this.buildSchema(data);
    const writer = await ParquetWriter.openFile(parquetSchema, filePath);

    try {
      for (const row of data) {
        await writer.appendRow(row);
      }
      await writer.close();
    } catch (error) {
      await writer.close();
      throw error;
    }
  }

  private getUniqueKey(tableName: string): string | null {
    const keys: Record<string, string> = {
      activities: 'activity_id',
      notes: 'id',
      medical_events: 'id',
    };
    return keys[tableName] || null;
  }
}
