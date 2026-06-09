import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { SupabaseStrategy } from './supabase.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
  ],
  providers: [AuthService, SupabaseStrategy],
  exports: [PassportModule, SupabaseStrategy],
})
export class AuthModule {}
