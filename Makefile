.PHONY: up down clean build test unit-test document-unit-test address-validation-test address-validation-unit-test status-notification-route-test contract-test integration-test e2e-test dev

up:
	docker compose up --build

down:
	docker compose down

clean:
	docker compose down -v --remove-orphans

build:
	docker compose build

test: unit-test document-unit-test address-validation-unit-test status-notification-route-test contract-test integration-test e2e-test ui-test

unit-test:
	docker compose --profile test run --rm unit-tests

document-unit-test:
	docker compose --profile test run --rm document-unit-tests

address-validation-test address-validation-unit-test:
	docker compose --profile test run --build --rm address-validation-tests

status-notification-route-test:
	docker compose --profile test run --build --rm status-notification-tests

contract-test:
	docker compose --profile test run --rm contract-tests

integration-test:
	docker compose --profile test run --rm integration-tests

e2e-test:
	docker compose --profile test run --rm e2e-tests

ui-test:
	docker compose --profile test build ui-tests
	docker compose --profile test run --rm ui-tests

dev:
	docker compose --profile dev up case-service-dev frontend-dev
