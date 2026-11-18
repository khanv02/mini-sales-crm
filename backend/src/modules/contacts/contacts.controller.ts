import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  contactCreateSchema,
  contactListQuerySchema,
  contactUpdateSchema,
  uuidSchema,
  type Contact,
  type ContactCreateRequest,
  type ContactListQuery,
  type ContactListResponse,
  type ContactUpdateRequest,
} from '@pulse/shared';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ContactsService } from './contacts.service';

/** Contacts are readable/writable by every role; visibility is enforced by the service (FR-03.3). */
@ApiTags('Contacts')
@ApiBearerAuth()
@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(contactListQuerySchema)) query: ContactListQuery,
  ): Promise<ContactListResponse> {
    return this.contacts.list(actor, query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(contactCreateSchema)) body: ContactCreateRequest,
    @Req() request: Request,
  ): Promise<Contact> {
    return this.contacts.create(actor, body, { ip: request.ip });
  }

  @Get(':id')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Contact> {
    return this.contacts.get(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(contactUpdateSchema)) body: ContactUpdateRequest,
    @Req() request: Request,
  ): Promise<Contact> {
    return this.contacts.update(actor, id, body, { ip: request.ip });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.contacts.remove(actor, id, { ip: request.ip });
  }
}
