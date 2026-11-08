FROM python:3.13-alpine
WORKDIR /app
COPY pipeline-mock/app.py .
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 8080
CMD ["python", "app.py"]
