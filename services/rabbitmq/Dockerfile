FROM rabbitmq:4-alpine

COPY rabbitmq.conf /etc/rabbitmq/conf.d/20-servired.conf
COPY entrypoint.sh /usr/local/bin/servired-entrypoint.sh
RUN chmod 755 /usr/local/bin/servired-entrypoint.sh

ENV RABBITMQ_NODENAME=rabbit@localhost

EXPOSE 5671 5672
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD rabbitmq-diagnostics -q ping

ENTRYPOINT ["servired-entrypoint.sh"]
CMD ["rabbitmq-server"]
