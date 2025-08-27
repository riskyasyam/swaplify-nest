import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class NsqService {
  private nsqHost: string;
  private nsqHttpPort: string;

  constructor(private configService: ConfigService) {
    this.nsqHost = this.configService.get('NSQ_HOST', '127.0.0.1');
    this.nsqHttpPort = this.configService.get('NSQ_HTTP_PORT', '4151');
    console.log(`🔄 NSQ: Configured to use HTTP API at ${this.nsqHost}:${this.nsqHttpPort}`);
  }

  async publishJob(topic: string, message: any): Promise<void> {
    console.log(`🔄 NSQ: Publishing to topic '${topic}' via HTTP API...`);
    console.log(`📝 NSQ: Message payload:`, JSON.stringify(message, null, 2));
    
    try {
      const nsqUrl = `http://${this.nsqHost}:${this.nsqHttpPort}/pub?topic=${topic}`;
      console.log(`🌐 NSQ: Sending POST request to ${nsqUrl}`);
      
      const response = await axios.post(nsqUrl, JSON.stringify(message), {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.status === 200) {
        console.log(`✅ NSQ: Successfully published message to topic '${topic}'`);
      } else {
        throw new Error(`NSQ HTTP API returned status ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ NSQ: Failed to publish message:`, error.message);
      if (error.code === 'ECONNREFUSED') {
        console.error(`❌ NSQ: Connection refused - make sure NSQ is running on ${this.nsqHost}:${this.nsqHttpPort}`);
      }
      throw error;
    }
  }
}
