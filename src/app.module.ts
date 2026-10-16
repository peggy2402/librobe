import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthorsModule } from './modules/authors/authors.module.js';
import { BooksModule } from './modules/books/books.module.js';
import { BorrowingsModule } from './modules/borrowings/borrowings.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { DatabaseModule } from './modules/database/database.module.js';
import { MembersModule } from './modules/members/members.module.js';
import { StatsModule } from './modules/stats/stats.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

const hasObserveKey = Boolean(process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET);

@Module({
  imports: [
    ...(hasObserveKey
      ? [
          ObserveModule.forRoot({
            appKey: process.env.OBSERVE_APP_KEY!,
            appSecret: process.env.OBSERVE_APP_SECRET!,
            serviceId: 'librobe',
          }),
        ]
      : []),
    DatabaseModule,
    AuthModule,
    CategoriesModule,
    AuthorsModule,
    BooksModule,
    MembersModule,
    BorrowingsModule,
    StatsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
