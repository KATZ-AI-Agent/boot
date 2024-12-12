import mongoose from 'mongoose';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { config } from './config.js';
import { DB_POOL_SIZE, DB_IDLE_TIMEOUT, DB_CONNECT_TIMEOUT } from './constants.js';
import { EventEmitter } from 'events';

class Database extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.database = null;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.retries = 5; // Maximum retries for connecting
    this.retryDelay = 5000; // Delay between retries in milliseconds
  }

  async connect() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  async _initialize() {
    while (this.retries > 0) {
      try {
        // Mongoose connection options
        const mongooseOptions = {
          serverApi: ServerApiVersion.v1,
          maxPoolSize: DB_POOL_SIZE || 50, // Controls the number of concurrent connections
          minPoolSize: 10, // Maintain a minimum pool size
          connectTimeoutMS: DB_CONNECT_TIMEOUT || 60000, // Connection timeout
          socketTimeoutMS: 300000, // 5 minutes Socket timeout
          serverSelectionTimeoutMS: 30000, // MongoDB server selection timeout
          heartbeatFrequencyMS: 30000, // 30 seconds
          retryWrites: true, // Enable retryable writes
          autoIndex: false, // Disable auto-indexing for production
          w: 'majority', // Majority write concern
        };

        console.log('🚀 Connecting to MongoDB Atlas with Mongoose...');
        await mongoose.connect(config.mongoUri, mongooseOptions);

        // MongoClient connection options
        const mongoClientOptions = {
          serverApi: ServerApiVersion.v1,
          maxPoolSize: DB_POOL_SIZE || 50,
          connectTimeoutMS: DB_CONNECT_TIMEOUT || 30000,
          socketTimeoutMS: 300000, // 5 minutes
          retryWrites: true,
          w: 'majority',
        };

        console.log('🚀 Connecting to MongoDB Atlas with MongoClient...');
        this.client = new MongoClient(config.mongoUri, mongoClientOptions);
        await this.client.connect();

        // Get the database reference
        this.database = this.client.db(config.mongoDatabase || 'KATZdatabase1');

        // Test connections
        await mongoose.connection.db.command({ ping: 1 });
        await this.database.command({ ping: 1 });

        console.log('✅ Successfully connected to MongoDB Atlas');
        this.isInitialized = true;
        this.emit('connected');

        return { client: this.client, database: this.database };
      } catch (error) {
        this.retries -= 1;
        console.error(`❌ MongoDB connection failed. Retries left: ${this.retries}`, error);

        if (this.retries === 0) {
          console.error('❌ All retries exhausted. Unable to connect to MongoDB Atlas.');
          this.isInitialized = false;
          this.initializationPromise = null;
          this.emit('error', error);
          throw error;
        }

        console.log(`🔄 Retrying in ${this.retryDelay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  async disconnect() {
    try {
      console.log('🔌 Disconnecting from MongoDB...');
      if (this.client) await this.client.close();
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      this.isInitialized = false;
      this.initializationPromise = null;
      console.log('✅ Disconnected from MongoDB');
      this.emit('disconnected');
    } catch (error) {
      console.error('❌ MongoDB disconnection error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  getDatabase() {
    if (!this.isInitialized || !this.database) {
      throw new Error('Database not initialized. Call connect first.');
    }
    return this.database;
  }

  async checkHealth() {
    try {
      if (mongoose.connection.readyState === 1) {
        console.log('✅ Mongoose connection is healthy');
      } else {
        throw new Error('Mongoose connection is not ready');
      }

      const pingResult = await this.database.command({ ping: 1 });
      if (!pingResult.ok) throw new Error('MongoClient ping failed');

      console.log('✅ MongoClient connection is healthy');
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

export const db = new Database();

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received. Closing MongoDB connections...');
  await db.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received. Closing MongoDB connections...');
  await db.disconnect();
  process.exit(0);
});
