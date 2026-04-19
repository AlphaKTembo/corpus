import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Lazy load DuckDB to avoid import errors if native bindings aren't available
let duckdb: any = null;
let duckdbAvailable = false;

@Injectable()
export class DuckdbService implements OnModuleInit, OnModuleDestroy {
  private db: any;
  private connection: any;
  private corpusRoot: string;
  private isAvailable = false;

  constructor(private configService: ConfigService) {
    this.corpusRoot = this.configService.get<string>('CORPUS_ROOT', '/data/corpus');
  }

  async onModuleInit() {
    try {
      // Try to load DuckDB dynamically
      duckdb = await import('duckdb');
      duckdbAvailable = true;
      
      this.db = new duckdb.Database(':memory:');
      this.connection = this.db.connect();
      
      // Register Parquet extension - use direct query execution for init
      return new Promise<void>((resolve) => {
        this.connection.all('INSTALL parquet;', (err: any) => {
          if (err) {
            console.warn('Failed to install parquet extension:', err.message);
            this.isAvailable = false;
            duckdbAvailable = false;
            resolve();
            return;
          }
          this.connection.all('LOAD parquet;', (err2: any) => {
            if (err2) {
              console.warn('Failed to load parquet extension:', err2.message);
              this.isAvailable = false;
              duckdbAvailable = false;
              resolve();
              return;
            }
            this.isAvailable = true;
            console.log('DuckDB initialized successfully');
            resolve();
          });
        });
      });
    } catch (error: any) {
      console.warn('DuckDB initialization failed (may not be available):', error.message);
      console.warn('API will continue without DuckDB. Some endpoints may not work.');
      this.isAvailable = false;
      duckdbAvailable = false;
      // Continue without DuckDB - some endpoints may not work
    }
  }

  async onModuleDestroy() {
    if (this.connection) {
      this.connection.close();
    }
    if (this.db) {
      this.db.close();
    }
  }

  isDuckDBAvailable(): boolean {
    return this.isAvailable && !!this.connection;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.isAvailable || !this.connection) {
      // Return empty array instead of throwing - let services handle gracefully
      console.warn('DuckDB not available, returning empty result');
      return [];
    }
    return new Promise((resolve, reject) => {
      this.connection.all(sql, params || [], (err: any, result: any) => {
        if (err) {
          // Log error but return empty array for graceful degradation
          console.error('DuckDB query error:', err.message);
          resolve([]);
        } else {
          resolve(result as T[]);
        }
      });
    });
  }

  getCanonicalPath(table: string): string {
    return `${this.corpusRoot}/canonical/${table}.parquet`;
  }

  getDerivedPath(table: string): string {
    return `${this.corpusRoot}/derived/${table}.parquet`;
  }

  async queryCanonical<T = any>(
    table: string,
    where?: string,
    orderBy?: string,
    limit?: number,
  ): Promise<T[]> {
    if (!this.isDuckDBAvailable()) {
      return [];
    }
    const path = this.getCanonicalPath(table);
    let sql = `SELECT * FROM read_parquet('${path}')`;
    
    if (where) {
      sql += ` WHERE ${where}`;
    }
    
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }
    
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    
    return this.query<T>(sql);
  }

  async queryDerived<T = any>(
    table: string,
    where?: string,
    orderBy?: string,
    limit?: number,
  ): Promise<T[]> {
    if (!this.isDuckDBAvailable()) {
      return [];
    }
    const path = this.getDerivedPath(table);
    let sql = `SELECT * FROM read_parquet('${path}')`;
    
    if (where) {
      sql += ` WHERE ${where}`;
    }
    
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }
    
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    
    return this.query<T>(sql);
  }

  async appendToCanonical<T extends Record<string, any>>(
    table: string,
    data: T[],
  ): Promise<void> {
    if (data.length === 0) return;

    const path = this.getCanonicalPath(table);
    const tempTable = `temp_${table}_${Date.now()}`;

    // Read existing data if file exists
    let existingData: T[] = [];
    try {
      existingData = await this.query<T>(`SELECT * FROM read_parquet('${path}')`);
    } catch (error) {
      // File doesn't exist yet, that's okay
    }

    // Merge and deduplicate
    const merged = [...existingData, ...data];
    const uniqueKey = this.getUniqueKey(table);
    const deduplicated = uniqueKey
      ? Array.from(new Map(merged.map((item) => [item[uniqueKey], item])).values())
      : merged;

    // Create temp table
    const columns = Object.keys(deduplicated[0]);
    const columnDefs = columns.map((col) => {
      const sample = deduplicated[0][col];
      const type = this.inferType(sample);
      return `${col} ${type}`;
    }).join(', ');

    await this.query(`CREATE TABLE ${tempTable} (${columnDefs})`);

    // Insert data
    for (const row of deduplicated) {
      const values = columns.map((col) => {
        const value = row[col];
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        return value;
      }).join(', ');
      await this.query(`INSERT INTO ${tempTable} VALUES (${values})`);
    }

    // Write to Parquet
    await this.query(`COPY ${tempTable} TO '${path}' (FORMAT PARQUET)`);
    await this.query(`DROP TABLE ${tempTable}`);
  }

  private getUniqueKey(table: string): string | null {
    const keys: Record<string, string> = {
      notes: 'id',
      medical_events: 'id',
    };
    return keys[table] || null;
  }

  private inferType(value: any): string {
    if (value === null || value === undefined) return 'VARCHAR';
    if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'DOUBLE';
    if (typeof value === 'boolean') return 'BOOLEAN';
    if (value instanceof Date) return 'TIMESTAMP';
    return 'VARCHAR';
  }
}

