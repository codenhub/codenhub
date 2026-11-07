# contacts

The office contact list. Everyone uses it from the shared drive.

```sh
node src/cli.ts list
node src/cli.ts add "Ana Souza" "+1 (555) 010-0100" ana@example.com
node src/cli.ts edit 3 phone "555 010 0300"
```

Contacts live in `data/contacts.json`. Run tests with `npm test`.
