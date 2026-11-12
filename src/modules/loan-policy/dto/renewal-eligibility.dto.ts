import { ApiProperty } from '@nestjs/swagger';

export enum RenewalBlockReason {
  NOT_OWNER = 'NOT_OWNER',
  INVALID_STATUS = 'INVALID_STATUS',
  OVERDUE = 'OVERDUE',
  MAX_RENEWALS_REACHED = 'MAX_RENEWALS_REACHED',
  OUTSIDE_RENEWAL_WINDOW = 'OUTSIDE_RENEWAL_WINDOW',
  ACTIVE_RESERVATION = 'ACTIVE_RESERVATION',
}

export class RenewalEligibilityDto {
  @ApiProperty({
    description: 'Người gọi có thể gia hạn phiếu tại thời điểm tra cứu',
    example: false,
  })
  canRenew!: boolean;

  @ApiProperty({
    description: 'Lý do chặn gia hạn; null khi đủ điều kiện',
    enum: RenewalBlockReason,
    enumName: 'RenewalBlockReason',
    nullable: true,
    example: RenewalBlockReason.ACTIVE_RESERVATION,
  })
  reasonCode!: RenewalBlockReason | null;

  @ApiProperty({
    description: 'Thông báo điều kiện gia hạn',
    example: 'Sách đã có người khác đặt trước',
  })
  message!: string;
}
