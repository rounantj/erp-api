import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";

@Injectable()
export class WhatsappRequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger("WhatsappHttp");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const started = Date.now();
    const label = `${req.method} ${req.originalUrl} empresa=${req.whatsappUser?.companyId ?? "?"}`;
    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`${label} ok ${Date.now() - started}ms`),
        error: (err) =>
          this.logger.warn(
            `${label} falhou ${Date.now() - started}ms: ${err?.status ?? ""} ${
              err?.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err?.message
            }`
          ),
      })
    );
  }
}
