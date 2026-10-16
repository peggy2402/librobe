import { PartialType } from '@nestjs/swagger';
import { CreateAuthorDto } from './create-author.dto.js';

export class UpdateAuthorDto extends PartialType(CreateAuthorDto) {}
