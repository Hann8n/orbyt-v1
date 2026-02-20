# Contributing to orbyt

Thank you for your interest in contributing to orbyt! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/orbyt-app.git`
3. Install dependencies: `yarn install`
4. Create a new branch: `git checkout -b feature/your-feature-name`

## Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow existing code patterns and conventions
- Use functional components with hooks
- Keep components focused and modular
- Use descriptive variable and function names

### TypeScript

- Avoid using `any` types - use proper types or `unknown` when necessary
- Define interfaces for complex objects
- Use type inference where appropriate

### Logging

- Use the centralized `logger` utility instead of `console.log`
- Use appropriate log levels: `debug`, `info`, `warn`, `error`
- Include context in error logs

### Testing

- Test your changes thoroughly before submitting
- Ensure the app builds and runs on both iOS and Android
- Test edge cases and error scenarios

## Submitting Changes

1. Ensure your code follows the project's style guidelines
2. Write clear, descriptive commit messages
3. Update documentation if needed
4. Submit a pull request with a clear description of your changes

## Pull Request Process

1. Update the README.md if needed
2. Ensure your code passes linting
3. Request review from maintainers
4. Address any feedback promptly

## Questions?

Feel free to open an issue for questions or discussions about the project.
