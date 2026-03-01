import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterWalletDto } from './dto/register-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { WalletResponse } from './dto/wallet-response.dto';
import { WalletNotFoundException } from '../common/exceptions/wallet-not-found.exception';
import { DuplicateWalletException } from '../common/exceptions/duplicate-wallet.exception';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterWalletDto): Promise<WalletResponse> {
    const address = dto.address.toLowerCase();
    const network = dto.network;

    try {
      const wallet = await this.prisma.$transaction(async (tx) => {
        const w = await tx.wallet.create({
          data: { address, network, label: dto.label ?? null },
        });
        await tx.walletSyncState.create({
          data: { walletId: w.id },
        });
        return w;
      });

      return this.toResponse(wallet);
    } catch (error: any) {
      // Prisma unique constraint violation (P2002)
      if (error.code === 'P2002') {
        throw new DuplicateWalletException(address, network);
      }
      throw error;
    }
  }

  async update(walletId: string, dto: UpdateWalletDto): Promise<WalletResponse> {
    try {
      const updated = await this.prisma.wallet.update({
        where: { id: walletId },
        data: { label: dto.label ?? null },
      });
      return this.toResponse(updated);
    } catch (error: any) {
      // Prisma record not found (P2025)
      if (error.code === 'P2025') {
        throw new WalletNotFoundException(walletId);
      }
      throw error;
    }
  }

  async findById(walletId: string): Promise<WalletResponse> {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) {
      throw new WalletNotFoundException(walletId);
    }
    return this.toResponse(wallet);
  }

  private toResponse(wallet: any): WalletResponse {
    return {
      id: wallet.id,
      address: wallet.address,
      network: wallet.network,
      label: wallet.label,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }
}
