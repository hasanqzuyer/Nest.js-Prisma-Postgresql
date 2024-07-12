<p align="center">
  <a href="https://patientsinfluence.com/" target="blank"><img src="docs/logo.png" width="200" alt="Patients Influence Logo" style="border-radius: 100px" /></a>
</p>

<div align="center" style="margin: 50px 0">
<h1 align="center" style="color: #428cc9; font-family: Poppins, Sans-serif; font-size: 30px; line-height: 38px">Patients Influence</h1>
<a href="https://nestjs.com/"><img src="https://img.shields.io/badge/NestJS-E0234E.svg?style=for-the-badge&logo=NestJS&logoColor=white"></a>
<a href="https://expressjs.com/"><img src="https://img.shields.io/badge/Express-000000.svg?style=for-the-badge&logo=Express&logoColor=white"></a>
<a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-4169E1.svg?style=for-the-badge&logo=PostgreSQL&logoColor=white"></a>
<a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-2496ED.svg?style=for-the-badge&logo=Docker&logoColor=white"></a>
<a href="https://jestjs.io/"><img src="https://img.shields.io/badge/Jest-C21325.svg?style=for-the-badge&logo=Jest&logoColor=white"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178C6.svg?style=for-the-badge&logo=TypeScript&logoColor=white"></a>
<a href="https://www.passportjs.org/"><img src="https://img.shields.io/badge/Passport-34E27A.svg?style=for-the-badge&logo=Passport&logoColor=white"></a>
<a href="https://github.com/features/actions"><img src="https://img.shields.io/badge/GitHub%20Actions-2088FF.svg?style=for-the-badge&logo=GitHub-Actions&logoColor=white"></a>
<a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/Visual%20Studio%20Code-007ACC.svg?style=for-the-badge&logo=Visual-Studio-Code&logoColor=white"></a>

<span style="font-family: Poppins, Sans-serif; font-size: 18px; line-height: 38px; margin-top: 20px; display: block">Services:</span>
<a href="https://wise.com/"><img src="https://img.shields.io/badge/Wise-00B9FF.svg?style=for-the-badge&logo=Wise&logoColor=white"></a>
<a href="https://aws.amazon.com/"><img src="https://img.shields.io/badge/Amazon%20AWS-232F3E.svg?style=for-the-badge&logo=Amazon-AWS&logoColor=white"></a>
<a href="https://aws.amazon.com/s3/"><img src="https://img.shields.io/badge/Amazon%20S3-569A31.svg?style=for-the-badge&logo=Amazon-S3&logoColor=white"></a>

<!-- <a href="https://aws.amazon.com/ec2/"><img src="https://img.shields.io/badge/Amazon%20EC2-FF9900.svg?style=for-the-badge&logo=Amazon-EC2&logoColor=white"></a> -->

</div>

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Environments](#environments)
  - [Development](#development)
  - [Production](#production)
  - [Test](#test)
- [Running tests](#running-tests)
- [Docker Scripts](#docker-scripts)
  - [Development](#development-1)
  - [Production](#production-1)
  - [Test](#test-1)
- [Prisma](#prisma)
  - [Dos and Don'ts](#dos-and-donts)
  - [Local](#local)
  - [Development](#development-2)
  - [Production](#production-2)
  - [Test](#test-2)
- [API Documentation](#api-documentation)

## Getting Started

This is a backend API built with Nest.js for [Patients Influence](https://patientsinfluence.com/) platform. It includes environments for development, production, and testing, each of which uses Docker scripts.

### Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) to run the application in a containerized environment
- [Node.js](https://nodejs.org/en) installed on your machine (version 18 or later)

If you are new to Node.js, you may want to start with the [official Node.js documentation](https://nodejs.org/en/docs). If you are not familiar with Docker, you can refer to the [Docker documentation](https://docs.docker.com/) for more information.

Additional tools:

- [Git](https://git-scm.com/) installed on your machine
- [NestJS](https://nestjs.com/) installed globally (version 9 or later; you can install it by running `npm install -g @nestjs/cli`)
- [PostgreSQL](https://www.postgresql.org/) to store the application data

### Installation

To get started with this project, follow these steps:

1. Clone the repository: `git clone https://github.com/patientsinfluence-ltd/patients-influence-nest.git`.
2. Install dependencies: `npm install`.
3. Set up the environment variables as described in the [Environments](#environments) section.
4. Start the server: `npm run start`.

## Environments

Environment variables are used to configure the app's behavior in different environments. The following environment variables are used:

| Name         | Description                                       | Default Value                     |
| ------------ | ------------------------------------------------- | --------------------------------- |
| NODE_ENV     | The environment the app is running in development | `development`                     |
| PORT         | The port the server is listening on               | `3000`                            |
| DATABASE_URL | The URL of the database                           | `postgres://localhost:5432/pi-db` |

To set an environment variable, create a `.env` file in the root directory of the project and set the variable's value there. (This is the case of production environment when using `npm start` command, and is a common case.)

In all other scenarios, create a `.env.<environment>` file in `env` directory based on examples in `.env.<environment>.example` files. Environments in which the app can run in are `development`, `production` and `test`. Adjust `<environment>` variable respectively.

### Development

To run the project in development mode, run:

```
npm run start:dev
```

The development environment uses the `.env.dev` file to configure environment variables and runs the project in watch mode.

If you want to use [hot module replacement (HMR)](https://docs.nestjs.com/recipes/hot-reload) for faster development, use the following command instead:

```
npm run start:dev:hmr
```

This command builds the project with Webpack, and runs the project in watch mode with HMR.

### Production

To run the project in production mode, run:

```
npm run start:prod
```

or:

```
npm start
```

The production environment uses the `.env.prod` file to configure environment variables.

**Note:** When running `npm start` command the application expects the `.env` file to configure environment variables, or it pulls them from the context where the application is running, eg. terminal session.

### Test

See more in the []() section.
To run the project in test mode, run:

```
npm run start:dev
```

The test environment uses the `.env.test` file to configure environment variables.

## Running tests

To run the tests, run:

```
npm run test
```

This command runs the Jest test suite and uses `.env.test` file to configure environment variables.

You can also run the tests in watch mode with the following command:

```
npm run test:watch
```

To generate test coverage reports, use the following command:

```
npm run test:cov
```

## Docker Scripts

The project includes Docker scripts for each environment. To use Docker, you must have Docker installed on your machine.

### Development

To start the development environment with Docker, use the following command:

```
npm run docker:dev:up
```

To stop the development environment, use the following command:

```
npm run docker:dev:down
```

### Production

To start the production environment with Docker, use the following command:

```
npm run docker:prod:up
```

To stop the production environment, use the following command:

```
npm run docker:prod:down
```

### Test

To start the testing environment with Docker, use the following command:

```
npm run docker:test:up
```

To stop the testing environment, use the following command:

```
npm run docker:test:down
```

To remove the testing database container, use the following command:

```
npm run docker:test:db:remove
```

To restart the testing database container and apply any pending migrations, use the following command:

```
npm run docker:test:db:restart
```

## Prisma

[Prisma Migration docs](https://www.prisma.io/docs/guides/migrate#in-this-section)

### Dos and Don'ts

| In Environment |                                  Do |           Do Not            |
| :------------- | ----------------------------------: | :-------------------------: |
| Local          |            push, generate, dev-seed |             \*              |
| Development    |     migrate dev, generate, dev-seed |             \*              |
| Stage          | migrate deploy, prod-seed, generate | push, migrate dev, dev-seed |
| Production     |            migrate deploy, generate | push, migrate dev, dev-seed |

The project uses Prisma as an ORM. To generate Prisma Client, migration SQL, apply Migrations or prototype the changes in schema.prisma, use the following commands:

---

### Local

In a local environment use:

```
npm run prisma:dev:push
```

to quickly prototype and iterate on schema design
without the need to deploy these changes to other environments.<br/>
This will:

- Apply the changes in your schema.prisma without generating migrations SQL.
- Generate Prisma Client
- Require the _--accept-data-loss_ if changes could result in data loss

```
npm run prisma:dev:generate
```

to generate the Prisma Client that reflects the schema.prisma definition that you can then use in the source code.

---

### Development

```
npm run prisma:dev:generate
```

Run:

```
npm run prisma:dev:migrate
```

to:

- Generate migration SQL
- Apply it using a shadow database
- Generate Prisma Client
  <br/>**This will generate the necessary Migration SQL that will be applied in production environment**

```
npm run prisma:dev:migrate:create
```

to:

- Generate migration SQL
  [Customizing migration files](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/customizing-migrations)

---

### Production

- Consider: Modifying the Migration SQL in development to prevent data loss (e.g. you can customize a migration to mitigate data loss that would be caused by a breaking change)

```
npm run prisma:prod:migrate
```

this will:

- Apply the migrations generated in development

---

### Test

```
npm run prisma:generate:test
```

To open the Prisma Studio UI, use the following commands:

```
npm run prisma:dev:studio
```

**Note:** Prisma Studio UI is available only in a local development environment. Use it for preview of DB models and simple queries such as create and delete a record.

## API Documentation

The documentation is generated using [Swagger](https://swagger.io/). You can access the Swagger UI by visiting `http://localhost:3000/api-docs`, or on the deployed application domain at `/api-docs` route.

If the application is still running locally but on a different port, go to `http://localhost:<port>/api-docs`, where a variable `<port>` is the port number.
#   N e s t - P r i s m a  
 #   N e s t . j s - P r i s m a - P o s t g r e s q l  
 