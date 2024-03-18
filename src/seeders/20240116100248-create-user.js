'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkInsert('users', [{
      firstName: 'Rashid',
      lastName : 'Hussain',
      email: 'rashid.h@copperdigital.com',
      password: '',
      created_at: new Date(),
      updated_at: new Date()
      }], {});
   },
 
  async down (queryInterface, Sequelize) {
    /**
     * Add commands to revert seed here.
     *
     * Example:
     * await queryInterface.bulkDelete('People', null, {});
     */
  }
};
