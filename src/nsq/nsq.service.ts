import { Injectable } from '@nestjs/common';
import { Writer } from 'nsqjs';

@Injectable()
export class NsqService {
  private writer: Writer;

  constructor() {
    console.log('🔄 NSQ: Initializing NSQ Writer...');
    this.writer = new Writer('127.0.0.1', '4150');
    console.log('🔄 NSQ: Connecting to NSQ...');
    this.writer.connect();
    
    this.writer.on('ready', () => {
      console.log('✅ NSQ Writer connected and ready!');
    });
    
    this.writer.on('error', (err) => {
      console.error('❌ NSQ Writer connection error:', err);
    });
  }

  async publishJob(topic: string, message: any): Promise<void> {
    console.log(`🔄 NSQ: Attempting to publish to topic '${topic}'...`);
    console.log(`📝 NSQ: Message payload:`, JSON.stringify(message, null, 2));
    
    return new Promise((resolve, reject) => {
      // Set timeout untuk avoid hanging
      const timeout = setTimeout(() => {
        console.error(`❌ NSQ: Timeout waiting for writer to be ready (10s)`);
        reject(new Error('NSQ Writer timeout - not ready within 10 seconds'));
      }, 10000);

      // Check if writer is already ready
      if (this.writer.ready) {
        console.log(`🟢 NSQ Writer is already ready, publishing message...`);
        clearTimeout(timeout);
        this.writer.publish(topic, JSON.stringify(message), (err) => {
          if (err) {
            console.error(`❌ NSQ Publish error:`, err);
            reject(err);
          } else {
            console.log(`✅ NSQ: Successfully published message to topic '${topic}'`);
            resolve();
          }
        });
        return;
      }

      // Wait for ready event
      console.log(`⏳ NSQ Writer not ready yet, waiting for ready event...`);
      this.writer.once('ready', () => {
        console.log(`🟢 NSQ Writer is now ready, publishing message...`);
        clearTimeout(timeout);
        this.writer.publish(topic, JSON.stringify(message), (err) => {
          if (err) {
            console.error(`❌ NSQ Publish error:`, err);
            reject(err);
          } else {
            console.log(`✅ NSQ: Successfully published message to topic '${topic}'`);
            resolve();
          }
        });
      });

      this.writer.once('error', (err) => {
        console.error(`❌ NSQ Writer error during publish:`, err);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}
