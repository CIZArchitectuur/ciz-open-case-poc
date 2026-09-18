.PHONY: up down clean build test unit-test contract-test integration-test e2e-test dev

up:
	docker compose up --build

down:
	docker compose down

clean:
	docker compose down -v --remove-orphans

build:
	docker compose build

test: unit-test document-unit-test contract-test integration-test e2e-test

unit-test:
	docker compose run --rm unit-tests

document-unit-test:
	docker compose run --rm document-unit-tests

contract-test:
	docker compose run --rm contract-tests

integration-test:
	docker compose run --rm integration-tests

e2e-test:
	docker compose run --rm e2e-tests

dev:
	docker compose --profile dev up case-service-dev frontend-dev
